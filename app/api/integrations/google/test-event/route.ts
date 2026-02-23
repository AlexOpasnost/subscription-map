import { NextResponse } from "next/server"

import { requireServerEnv } from "@/lib/env"
import { supabaseServer } from "@/lib/supabase/server"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

async function refreshGoogleAccessToken(input: { refreshToken: string }): Promise<{ accessToken: string; expiresAtIso: string }> {
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

export async function POST() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const userId = user.id
  console.log("[integrations/google/test-event] start", { userId })

  // Load integration row (requested source for refresh_token visibility).
  const { data: integration, error: intErr } = await supabase
    .from("integrations")
    .select("provider,access_token,refresh_token,expires_at,scope,meta,metadata,created_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (intErr) return NextResponse.json({ ok: false, error: intErr.message }, { status: 500 })
  if (!integration) return NextResponse.json({ ok: false, error: "NO_INTEGRATION" }, { status: 400 })

  // Also load oauth_tokens (used by other parts of the app); keep them in sync.
  const { data: tokenRow } = await supabase
    .from("oauth_tokens")
    .select("id,access_token,refresh_token,expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle()

  const refreshToken =
    (typeof (integration as any).refresh_token === "string" ? String((integration as any).refresh_token) : "").trim() ||
    (isRecord(tokenRow) && typeof tokenRow.refresh_token === "string" ? tokenRow.refresh_token : "")?.trim() ||
    ""

  const rawExpiresAt =
    typeof (integration as any).expires_at === "string"
      ? String((integration as any).expires_at)
      : isRecord(tokenRow) && typeof tokenRow.expires_at === "string"
        ? tokenRow.expires_at
        : null
  const expiresAtMs = rawExpiresAt ? new Date(rawExpiresAt).getTime() : NaN
  const needsRefresh = !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() < 60_000

  let accessToken = typeof (integration as any).access_token === "string" ? String((integration as any).access_token) : ""
  let refreshed = false

  if (needsRefresh) {
    if (!refreshToken) {
      console.warn("[integrations/google/test-event] NO_REFRESH_TOKEN", { userId })
      return NextResponse.json({ ok: false, error: "NO_REFRESH_TOKEN" }, { status: 400 })
    }
    const refreshedToken = await refreshGoogleAccessToken({ refreshToken })
    accessToken = refreshedToken.accessToken
    refreshed = true

    // Update integrations (do not overwrite refresh_token with null).
    const { error: updIntErr } = await supabase
      .from("integrations")
      .update({ access_token: refreshedToken.accessToken, expires_at: refreshedToken.expiresAtIso })
      .eq("user_id", userId)
      .eq("provider", "google")
    if (updIntErr) console.error("[integrations/google/test-event] integrations update failed", { userId, error: updIntErr.message })

    // Best-effort update oauth_tokens too (if present).
    if (isRecord(tokenRow) && typeof tokenRow.id === "string") {
      const { error: updTokErr } = await supabase
        .from("oauth_tokens")
        .update({ access_token: refreshedToken.accessToken, expires_at: refreshedToken.expiresAtIso })
        .eq("id", tokenRow.id)
      if (updTokErr) console.error("[integrations/google/test-event] oauth_tokens update failed", { userId, error: updTokErr.message })
    }
  }

  const calendarId = "primary"
  const start = new Date(Date.now() + 2 * 60_000)
  const end = new Date(start.getTime() + 10 * 60_000)
  const body = {
    summary: "Subscription Map Test Event",
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  }

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  console.log("[integrations/google/test-event] google response", { userId, refreshed, status: res.status })

  if (!res.ok) {
    console.error("[integrations/google/test-event] events.insert failed", { userId, refreshed, status: res.status, body: text.slice(0, 2000) })
    return NextResponse.json({ ok: false, error: `Google Calendar API error (HTTP ${res.status})`, googleErrorBody: text }, { status: 502 })
  }

  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  } catch {
    return NextResponse.json({ ok: false, error: "Google Calendar API returned invalid JSON", googleErrorBody: text }, { status: 502 })
  }
  if (!isRecord(json)) {
    return NextResponse.json({ ok: false, error: "Google Calendar API returned invalid JSON", googleErrorBody: text }, { status: 502 })
  }

  const eventId = typeof json.id === "string" ? json.id : ""
  const htmlLink = typeof json.htmlLink === "string" ? json.htmlLink : ""
  if (!eventId) {
    return NextResponse.json({ ok: false, error: "Google Calendar API returned no event id", googleErrorBody: text }, { status: 502 })
  }

  console.log("[integrations/google/test-event] created event", { userId, refreshed, calendarId, eventId })
  return NextResponse.json({ ok: true, eventId, htmlLink })
}

export async function GET() {
  return POST()
}

