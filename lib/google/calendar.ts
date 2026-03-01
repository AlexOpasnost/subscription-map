import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { requireServerEnv } from "@/lib/env"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export type GoogleCalendarUpsertInput = {
  userId: string
  title: string
  dueAt?: string | null
  dueDate?: string | null // YYYY-MM-DD
  calendarId?: string | null
  description?: string | null
  existingEventId?: string | null
}

export type GoogleCalendarUpsertResult = {
  eventId: string
  calendarId: string
  htmlLink?: string
  mode: "created" | "updated"
  kind: "timed" | "all_day"
}

export class GoogleReconnectRequiredError extends Error {
  code = "NO_REFRESH_TOKEN" as const
  constructor(message = "Google refresh_token missing. Reconnect Google Calendar.") {
    super(message)
    this.name = "GoogleReconnectRequiredError"
  }
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

async function getIntegrationForUser(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("integrations")
    .select("provider,access_token,refresh_token,expires_at,scope,meta,metadata,created_at,status")
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as any
}

async function ensureFreshAccessToken(supabase: SupabaseClient, userId: string): Promise<{ accessToken: string; refreshed: boolean }> {
  const integration = await getIntegrationForUser(supabase, userId)
  if (!integration) throw new Error("GOOGLE_NOT_CONNECTED")
  const status = typeof integration.status === "string" ? String(integration.status) : ""
  if (status && status.toLowerCase() === "disconnected") throw new Error("GOOGLE_NOT_CONNECTED")

  const refreshToken = typeof integration.refresh_token === "string" ? integration.refresh_token.trim() : ""
  const expiresAtMs = typeof integration.expires_at === "string" ? new Date(integration.expires_at).getTime() : NaN
  const needsRefresh = !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() < 60_000

  // Keep behavior aligned with test-event: require refresh_token when refresh is needed.
  if (needsRefresh) {
    if (!refreshToken) throw new GoogleReconnectRequiredError()
    const refreshedToken = await refreshGoogleAccessToken({ refreshToken })

    // Update integrations row (do not overwrite refresh_token).
    const { error: updErr } = await supabase
      .from("integrations")
      .update({ access_token: refreshedToken.accessToken, expires_at: refreshedToken.expiresAtIso })
      .eq("user_id", userId)
      .eq("provider", "google")
    if (updErr) {
      // Best-effort: continue anyway with refreshed access token.
      console.error("[google/calendar] integrations token update failed", { userId, error: updErr.message })
    }

    // Best-effort keep oauth_tokens in sync too (some flows still read it).
    try {
      const { data: tok } = await supabase.from("oauth_tokens").select("id").eq("user_id", userId).eq("provider", "google").maybeSingle()
      const tokId = typeof (tok as any)?.id === "string" ? String((tok as any).id) : ""
      if (tokId) {
        await supabase.from("oauth_tokens").update({ access_token: refreshedToken.accessToken, expires_at: refreshedToken.expiresAtIso }).eq("id", tokId)
      }
    } catch {
      // ignore
    }

    return { accessToken: refreshedToken.accessToken, refreshed: true }
  }

  const accessToken = typeof integration.access_token === "string" ? String(integration.access_token) : ""
  if (!accessToken.trim()) {
    // No access token: force refresh if possible.
    if (!refreshToken) throw new GoogleReconnectRequiredError()
    const refreshedToken = await refreshGoogleAccessToken({ refreshToken })
    await supabase.from("integrations").update({ access_token: refreshedToken.accessToken, expires_at: refreshedToken.expiresAtIso }).eq("user_id", userId).eq("provider", "google")
    return { accessToken: refreshedToken.accessToken, refreshed: true }
  }

  return { accessToken, refreshed: false }
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60 * 1000)
}

function addDaysDateOnly(isoDateOnly: string, days: number): string {
  const dt = new Date(`${isoDateOnly}T00:00:00.000Z`)
  return new Date(dt.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function buildEventBody(input: GoogleCalendarUpsertInput): { kind: "timed" | "all_day"; body: Record<string, unknown> } | null {
  const title = input.title.trim() || "Task"
  const description = input.description?.trim() ? String(input.description).trim() : undefined

  if (input.dueAt && String(input.dueAt).trim()) {
    const start = new Date(String(input.dueAt))
    if (Number.isNaN(start.getTime())) return null
    const end = addMinutes(start, 30)
    return {
      kind: "timed",
      body: {
        summary: title,
        ...(description ? { description } : {}),
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    }
  }

  if (input.dueDate && String(input.dueDate).trim()) {
    const dueDate = String(input.dueDate).trim()
    const endExclusive = addDaysDateOnly(dueDate, 1)
    return {
      kind: "all_day",
      body: {
        summary: title,
        ...(description ? { description } : {}),
        start: { date: dueDate },
        end: { date: endExclusive },
      },
    }
  }

  return null
}

async function calendarRequest(
  accessToken: string,
  path: string,
  init: RequestInit & { method: "POST" | "PUT" }
): Promise<{ status: number; text: string }> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  return { status: res.status, text: await res.text() }
}

export async function upsertGoogleCalendarEventForUser(
  supabase: SupabaseClient,
  input: GoogleCalendarUpsertInput
): Promise<GoogleCalendarUpsertResult> {
  const calendarId = (input.calendarId ?? "").trim() || "primary"
  const built = buildEventBody(input)
  if (!built) throw new Error("MISSING_DUE_AT_OR_DUE_DATE")

  const { accessToken, refreshed } = await ensureFreshAccessToken(supabase, input.userId)
  const existingEventId = (input.existingEventId ?? "").trim()

  const mode: "created" | "updated" = existingEventId ? "updated" : "created"
  console.log("[google/calendar] upsert attempt", {
    userId: input.userId,
    calendarId,
    mode,
    kind: built.kind,
    refreshed,
  })

  const path = existingEventId
    ? `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId)}?sendUpdates=none`
    : `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`

  const { status, text } = await calendarRequest(accessToken, path, {
    method: existingEventId ? "PUT" : "POST",
    body: JSON.stringify(built.body),
  })

  if (status < 200 || status >= 300) {
    console.error("[google/calendar] events upsert failed", { userId: input.userId, status, body: text.slice(0, 2000) })
    throw new Error(`Google Calendar API error (HTTP ${status})`)
  }

  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  } catch {
    throw new Error("Google Calendar API returned invalid JSON")
  }
  if (!isRecord(json)) throw new Error("Google Calendar API returned invalid JSON")

  const eventId = typeof json.id === "string" ? json.id : ""
  const htmlLink = typeof json.htmlLink === "string" ? json.htmlLink : ""
  if (!eventId.trim()) throw new Error("Google Calendar API returned no event id")

  console.log("[google/calendar] upsert ok", { userId: input.userId, calendarId, mode, kind: built.kind, eventId })
  return { eventId, calendarId, htmlLink: htmlLink || undefined, mode, kind: built.kind }
}

