import "server-only"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { requireServerEnv } from "@/lib/env"

type IntegrationRow = {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  meta?: unknown
  metadata?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

async function refreshAccessToken(integration: IntegrationRow): Promise<{ accessToken: string; expiresAtIso: string }> {
  const refreshToken = integration.refresh_token?.trim() ?? ""
  if (!refreshToken) {
    console.warn(`[google/createEvent] missing refresh_token user_id=${integration.user_id}`)
    throw new Error("Google refresh_token is missing; please reconnect Google Calendar.")
  }

  const clientId = requireServerEnv("GOOGLE_CLIENT_ID")
  const clientSecret = requireServerEnv("GOOGLE_CLIENT_SECRET")

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

async function ensureValidAccessToken(integration: IntegrationRow): Promise<{ accessToken: string; expiresAt: string | null }> {
  const expiresAtMs = integration.expires_at ? new Date(integration.expires_at).getTime() : NaN
  const now = Date.now()
  const hasExpiry = Number.isFinite(expiresAtMs)
  const needsRefresh = !hasExpiry || expiresAtMs - now < 60_000

  // TEMP DEBUG LOGGING (remove after verification)
  console.log(
    `[google/createEvent] user_id=${integration.user_id} has_expiry=${hasExpiry} expires_at=${integration.expires_at ?? ""} needs_refresh=${needsRefresh}`
  )

  if (!needsRefresh) return { accessToken: integration.access_token, expiresAt: integration.expires_at }

  const { accessToken, expiresAtIso } = await refreshAccessToken(integration)
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("integrations").update({ access_token: accessToken, expires_at: expiresAtIso }).eq("id", integration.id)
  if (error) {
    console.error(`[google/createEvent] failed saving refreshed token user_id=${integration.user_id} err=${error.message}`)
    // Continue anyway with the fresh token; worst-case the next call refreshes again.
  }
  return { accessToken, expiresAt: expiresAtIso }
}

export async function createGoogleCalendarEventForUser(input: {
  userId: string
  event: Record<string, unknown>
}): Promise<{ eventId: string; htmlLink: string }> {
  const supabase = getSupabaseAdmin()
  const { data: integration, error } = await supabase
    .from("integrations")
    .select("id,user_id,provider,access_token,refresh_token,expires_at,meta,metadata")
    .eq("user_id", input.userId)
    .eq("provider", "google")
    .maybeSingle()

  if (error) throw error
  if (!integration) throw new Error("Google integration not connected")

  const { accessToken } = await ensureValidAccessToken(integration as IntegrationRow)

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

