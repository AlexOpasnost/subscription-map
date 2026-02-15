import "server-only"

import { requireServerEnv } from "@/lib/env"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

type OAuthTokenRow = {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  scope: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

async function refreshAccessToken(tokens: OAuthTokenRow): Promise<{ accessToken: string; expiresAtIso: string }> {
  const refreshToken = tokens.refresh_token?.trim() ?? ""
  if (!refreshToken) {
    console.warn(`[google/createEvent] token missing refresh_token user_id=${tokens.user_id}`)
    throw new Error("Missing refresh token")
  }

  const clientId = requireServerEnv("GOOGLE_CLIENT_ID")
  const clientSecret = requireServerEnv("GOOGLE_CLIENT_SECRET")

  console.log(`[google/createEvent] refresh attempt user_id=${tokens.user_id}`)
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  })

  const bodyText = await res.text()
  if (!res.ok) {
    console.error(`[google/createEvent] token refresh failed status=${res.status} body=${bodyText.slice(0, 1200)}`)
    throw new Error(`Google token refresh failed (HTTP ${res.status})`)
  }

  let json: unknown
  try {
    json = JSON.parse(bodyText) as unknown
  } catch {
    console.error(`[google/createEvent] token refresh invalid JSON body=${bodyText.slice(0, 1200)}`)
    throw new Error("Google token refresh returned invalid JSON")
  }

  if (!isRecord(json)) throw new Error("Google token refresh returned invalid JSON")
  const accessToken = typeof json.access_token === "string" ? json.access_token : ""
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 0
  if (!accessToken || !expiresIn) throw new Error("Google token refresh returned missing fields")

  const expiresAtIso = new Date(Date.now() + expiresIn * 1000).toISOString()
  return { accessToken, expiresAtIso }
}

async function ensureValidAccessToken(tokens: OAuthTokenRow): Promise<{ accessToken: string; expiresAt: string | null }> {
  const expiresAtMs = tokens.expires_at ? new Date(tokens.expires_at).getTime() : NaN
  const now = Date.now()
  const hasExpiry = Number.isFinite(expiresAtMs)
  const needsRefresh = !hasExpiry || expiresAtMs - now < 60_000

  // TEMP DEBUG LOGGING (remove after verification)
  console.log(
    `[google/createEvent] token expired? user_id=${tokens.user_id} has_expiry=${hasExpiry} expires_at=${tokens.expires_at ?? ""} needs_refresh=${needsRefresh}`
  )

  if (!needsRefresh) return { accessToken: tokens.access_token, expiresAt: tokens.expires_at }

  const { accessToken, expiresAtIso } = await refreshAccessToken(tokens)
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("oauth_tokens").update({ access_token: accessToken, expires_at: expiresAtIso }).eq("id", tokens.id)
  if (error) {
    console.error(`[google/createEvent] failed saving refreshed token user_id=${tokens.user_id} err=${error.message}`)
    // Continue anyway with the fresh token; worst-case the next call refreshes again.
  }
  return { accessToken, expiresAt: expiresAtIso }
}

export async function createGoogleCalendarEventForUser(input: {
  userId: string
  event: Record<string, unknown>
}): Promise<{ eventId: string; htmlLink: string }> {
  const supabase = getSupabaseAdmin()
  const { data: tokens, error } = await supabase
    .from("oauth_tokens")
    .select("id,user_id,provider,access_token,refresh_token,expires_at,scope")
    .eq("user_id", input.userId)
    .eq("provider", "google")
    .maybeSingle()

  if (error) throw error
  if (!tokens) throw new Error("Google tokens not found")

  const { accessToken } = await ensureValidAccessToken(tokens as OAuthTokenRow)

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.event),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`[google/createEvent] google API failure status=${res.status}`)
    console.error(`[google/createEvent] calendar API error status=${res.status} body=${text.slice(0, 2000)}`)
    throw new Error(`Google Calendar API error (HTTP ${res.status})`)
  }

  // TEMP DEBUG LOGGING (remove after verification)
  console.log(`[google/createEvent] calendar response body=${text.slice(0, 2000)}`)

  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  } catch {
    throw new Error("Google Calendar API returned invalid JSON")
  }

  if (!isRecord(json)) throw new Error("Google Calendar API returned invalid JSON")
  const eventId = typeof json.id === "string" ? json.id : ""
  const htmlLink = typeof json.htmlLink === "string" ? json.htmlLink : ""
  if (!eventId) throw new Error("Google Calendar API returned no event id")
  return { eventId, htmlLink }
}

