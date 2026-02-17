import { NextResponse } from "next/server"

import { requireServerEnv } from "@/lib/env"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { supabaseServer } from "@/lib/supabase/server"

type OAuthTokenRow = {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token: string | null
  expires_at: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

async function refreshGoogleAccessToken(input: {
  refreshToken: string
}): Promise<{ accessToken: string; expiresAtIso: string }> {
  const clientId = requireServerEnv("GOOGLE_CLIENT_ID")
  const clientSecret = requireServerEnv("GOOGLE_CLIENT_SECRET")

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Google token refresh failed (HTTP ${res.status}): ${text.slice(0, 1200)}`)
  }

  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  } catch {
    throw new Error(`Google token refresh returned invalid JSON: ${text.slice(0, 1200)}`)
  }
  if (!isRecord(json)) throw new Error("Google token refresh returned invalid JSON")
  const accessToken = typeof json.access_token === "string" ? json.access_token : ""
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 0
  if (!accessToken || !expiresIn) throw new Error("Google token refresh returned missing fields")
  const expiresAtIso = new Date(Date.now() + expiresIn * 1000).toISOString()
  return { accessToken, expiresAtIso }
}

export async function GET() {
  // 1) Require logged-in user (cookie-based auth).
  const sb = await supabaseServer()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })
  }

  const userId = user.id
  const admin = getSupabaseAdmin()

  console.log("[integrations/google/test] start", { userId })

  // 2) Load oauth_tokens from DB.
  const { data: tokenRow, error: tokenErr } = await admin
    .from("oauth_tokens")
    .select("id,user_id,provider,access_token,refresh_token,expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle()
  if (tokenErr) {
    console.error("[integrations/google/test] oauth_tokens select error", { userId, error: tokenErr.message })
    return NextResponse.json({ ok: false, error: tokenErr.message }, { status: 500 })
  }
  if (!tokenRow) {
    console.warn("[integrations/google/test] missing oauth_tokens row", { userId })
    return NextResponse.json({ ok: false, error: "Google tokens not found" }, { status: 400 })
  }

  const tokens = tokenRow as OAuthTokenRow

  // 3) Ensure valid access token (refresh if expired).
  let accessToken = tokens.access_token
  let refreshed = false
  const expiresAtMs = tokens.expires_at ? new Date(tokens.expires_at).getTime() : NaN
  const needsRefresh = !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() < 60_000
  if (needsRefresh) {
    const rt = tokens.refresh_token?.trim() ?? ""
    if (!rt) {
      console.warn("[integrations/google/test] missing refresh_token", { userId })
      return NextResponse.json({ ok: false, error: "Missing refresh token" }, { status: 400 })
    }
    console.log("[integrations/google/test] refreshing access token", { userId })
    try {
      const refreshedToken = await refreshGoogleAccessToken({ refreshToken: rt })
      accessToken = refreshedToken.accessToken
      refreshed = true
      const { error: updErr } = await admin
        .from("oauth_tokens")
        .update({ access_token: refreshedToken.accessToken, expires_at: refreshedToken.expiresAtIso })
        .eq("id", tokens.id)
      if (updErr) console.error("[integrations/google/test] failed updating oauth_tokens", { userId, error: updErr.message })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Token refresh failed"
      console.error("[integrations/google/test] token refresh failed", { userId, msg })
      return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
  }

  // 4) Call Calendar API events.insert on primary.
  const calendarId = "primary"
  const start = new Date(Date.now() + 2 * 60_000)
  const end = new Date(start.getTime() + 10 * 60_000)

  const body = {
    summary: "Subscription Map – Test Event",
    description: "If you see this, Google Calendar write works.",
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  }

  let googleStatus = 0
  let googleBody = ""
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    googleStatus = res.status
    googleBody = await res.text()

    console.log("[integrations/google/test] google response", { userId, refreshed, status: googleStatus })

    if (!res.ok) {
      console.error("[integrations/google/test] events.insert failed", { userId, refreshed, status: googleStatus, body: googleBody.slice(0, 2000) })
      return NextResponse.json(
        {
          ok: false,
          error: `Google Calendar API error (HTTP ${googleStatus})`,
          googleErrorBody: googleBody,
        },
        { status: 502 }
      )
    }

    let json: unknown
    try {
      json = JSON.parse(googleBody) as unknown
    } catch {
      return NextResponse.json(
        { ok: false, error: "Google Calendar API returned invalid JSON", googleErrorBody: googleBody },
        { status: 502 }
      )
    }
    if (!isRecord(json)) {
      return NextResponse.json(
        { ok: false, error: "Google Calendar API returned invalid JSON", googleErrorBody: googleBody },
        { status: 502 }
      )
    }

    const eventId = typeof json.id === "string" ? json.id : ""
    const htmlLink = typeof json.htmlLink === "string" ? json.htmlLink : ""
    console.log("[integrations/google/test] created event", { userId, refreshed, calendarId, eventId })

    return NextResponse.json({ ok: true, calendarId, eventId, htmlLink })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Google request failed"
    console.error("[integrations/google/test] unexpected failure", { userId, refreshed, status: googleStatus, msg })
    return NextResponse.json({ ok: false, error: msg, googleErrorBody: googleBody || null }, { status: 500 })
  }
}

