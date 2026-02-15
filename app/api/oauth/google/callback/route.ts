import { NextResponse, type NextRequest } from "next/server"

import { getAppOriginServer, requireServerEnv } from "@/lib/env"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

function parseState(state: string): { userId: string } {
  // Format: `${userId}:${uuid}`
  const idx = state.indexOf(":")
  const userId = idx > 0 ? state.slice(0, idx).trim() : ""
  if (!userId) throw new Error("Invalid state")
  return { userId }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export async function GET(req: NextRequest) {
  const origin = getAppOriginServer() ?? req.nextUrl.origin
  const redirectTo = new URL("/settings/integrations", origin)
  const redirectUri = `${origin}/api/oauth/google/callback`

  try {
    const url = new URL(req.url)
    const error = url.searchParams.get("error")
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")

    if (error) {
      redirectTo.searchParams.set("error", `google:${error}`)
      return NextResponse.redirect(redirectTo)
    }
    if (!code || !state) {
      redirectTo.searchParams.set("error", "google:missing_code_or_state")
      return NextResponse.redirect(redirectTo)
    }

    const { userId } = parseState(state)

    const clientId = requireServerEnv("GOOGLE_CLIENT_ID")
    const clientSecret = requireServerEnv("GOOGLE_CLIENT_SECRET")

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    })

    if (!tokenRes.ok) {
      const details = await tokenRes.text()
      redirectTo.searchParams.set("error", "google:token_exchange_failed")
      redirectTo.searchParams.set("details", details.slice(0, 600))
      return NextResponse.redirect(redirectTo)
    }

    const tokenJson = (await tokenRes.json()) as unknown
    if (!isRecord(tokenJson)) throw new Error("Invalid token response")

    const accessToken = typeof tokenJson.access_token === "string" ? tokenJson.access_token : ""
    const expiresIn = typeof tokenJson.expires_in === "number" ? tokenJson.expires_in : 0
    const refreshToken = typeof tokenJson.refresh_token === "string" ? tokenJson.refresh_token : null
    const scope = typeof tokenJson.scope === "string" ? tokenJson.scope : null

    if (!accessToken) throw new Error("Missing access token")

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null
    const supabase = getSupabaseAdmin()

    // oauth_tokens is the source of truth for Google tokens.
    // Only update refresh_token if Google returned it; otherwise keep existing DB value.
    const { data: existingToken } = await supabase
      .from("oauth_tokens")
      .select("id,refresh_token")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle()

    if (existingToken && isRecord(existingToken) && typeof existingToken["id"] === "string") {
      const update: Record<string, unknown> = { access_token: accessToken, expires_at: expiresAt, scope }
      if (refreshToken) update.refresh_token = refreshToken
      const { error } = await supabase.from("oauth_tokens").update(update).eq("id", existingToken["id"])
      if (error) throw error
    } else {
      const { error } = await supabase.from("oauth_tokens").insert({
        user_id: userId,
        provider: "google",
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        scope,
      })
      if (error) throw error
    }

    // integrations is for connection status + metadata only (no tokens).
    const scopesArr = scope ? scope.split(/\s+/).filter(Boolean) : null
    await supabase.from("integrations").upsert(
      {
        user_id: userId,
        provider: "google",
        status: "connected",
        expires_at: expiresAt,
        scopes: scopesArr,
        scope,
        meta: { scopes: scopesArr ?? undefined, calendar_id: "primary" },
        access_token: "",
        refresh_token: null,
      },
      { onConflict: "user_id,provider" }
    )

    redirectTo.searchParams.set("connected", "google")
    return NextResponse.redirect(redirectTo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    redirectTo.searchParams.set("error", "google:unexpected")
    redirectTo.searchParams.set("details", message.slice(0, 600))
    return NextResponse.redirect(redirectTo)
  }
}

