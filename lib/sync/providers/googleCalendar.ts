import type { SupabaseClient } from "@supabase/supabase-js"

import type { IntegrationRow, SyncAction } from "@/lib/sync/types"
import { addDaysIsoDate, getObject, getString, isRecord } from "@/lib/sync/shared"

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`)
  return v
}

async function refreshGoogleAccessToken(integration: IntegrationRow): Promise<{ accessToken: string; expiresAtIso: string }> {
  const refreshToken = integration.refresh_token
  if (!refreshToken) throw new Error("Google refresh_token is missing; please reconnect Google Calendar.")

  const clientId = getEnv("GOOGLE_CLIENT_ID")
  const clientSecret = getEnv("GOOGLE_CLIENT_SECRET")

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

  if (!res.ok) {
    const details = await res.text()
    throw new Error(`Google token refresh failed: ${details.slice(0, 600)}`)
  }

  const json = (await res.json()) as unknown
  if (!isRecord(json)) throw new Error("Google token refresh returned invalid JSON")
  const accessToken = getString(json.access_token)
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 0
  if (!accessToken || !expiresIn) throw new Error("Google token refresh returned missing fields")
  const expiresAtIso = new Date(Date.now() + expiresIn * 1000).toISOString()
  return { accessToken, expiresAtIso }
}

async function ensureGoogleAccessToken(
  supabase: SupabaseClient,
  integration: IntegrationRow
): Promise<{ accessToken: string; integration: IntegrationRow }> {
  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : null
  const now = Date.now()
  const needsRefresh = expiresAt !== null && Number.isFinite(expiresAt) && expiresAt - now < 60_000

  if (!needsRefresh) return { accessToken: integration.access_token, integration }

  const { accessToken, expiresAtIso } = await refreshGoogleAccessToken(integration)
  const { data, error } = await supabase
    .from("integrations")
    .update({ access_token: accessToken, expires_at: expiresAtIso })
    .eq("id", integration.id)
    .select("id,user_id,provider,access_token,refresh_token,expires_at,meta,created_at")
    .single()

  if (error) throw error
  return { accessToken, integration: data as IntegrationRow }
}

async function googleCalendarRequest(
  accessToken: string,
  path: string,
  init: RequestInit & { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" }
): Promise<unknown> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })

  if (!res.ok) {
    const details = await res.text()
    throw new Error(`Google Calendar API error (${res.status}): ${details.slice(0, 800)}`)
  }

  if (res.status === 204) return null
  return (await res.json()) as unknown
}

async function upsertEvent(
  accessToken: string,
  input: { calendarId: string; existingEventId?: string; body: Record<string, unknown> }
): Promise<{ eventId: string }> {
  const calendarId = encodeURIComponent(input.calendarId)
  if (input.existingEventId) {
    const eventId = encodeURIComponent(input.existingEventId)
    const updated = await googleCalendarRequest(accessToken, `/calendars/${calendarId}/events/${eventId}?sendUpdates=none`, {
      method: "PUT",
      body: JSON.stringify(input.body),
    })
    const id = getString(isRecord(updated) ? updated.id : "")
    if (!id) throw new Error("Google Calendar update returned no event id")
    return { eventId: id }
  }

  const created = await googleCalendarRequest(accessToken, `/calendars/${calendarId}/events?sendUpdates=none`, {
    method: "POST",
    body: JSON.stringify(input.body),
  })
  const id = getString(isRecord(created) ? created.id : "")
  if (!id) throw new Error("Google Calendar insert returned no event id")
  return { eventId: id }
}

type TaskRow = { id: string; title: string; due_at: string | null; meta: unknown }
type PlanRow = { id: string; title: string; start_date: string | null; end_date: string | null; meta: unknown }
type SubscriptionRow = { id: string; service: string; renewal_date: string | null; meta: unknown }

async function updateRecordMeta(
  supabase: SupabaseClient,
  table: "tasks" | "plans" | "subscriptions",
  id: string,
  nextMeta: Record<string, unknown>
) {
  const { error } = await supabase.from(table).update({ meta: nextMeta }).eq("id", id)
  if (error) throw error
}

export async function pushToGoogleCalendar(
  supabase: SupabaseClient,
  integration: IntegrationRow,
  input: { action: SyncAction; recordId: string; log: (msg: string) => Promise<void> }
): Promise<void> {
  const calendarId = "primary"
  const ensured = await ensureGoogleAccessToken(supabase, integration)
  const accessToken = ensured.accessToken

  if (input.action === "push_task") {
    const { data, error } = await supabase.from("tasks").select("id,title,due_at,meta").eq("id", input.recordId).single()
    if (error) throw error
    const task = data as TaskRow
    if (!task.due_at) {
      await input.log("Task has no due_at; skipping Google Calendar event.")
      return
    }

    const existingEventId = getString(getObject(task.meta).google_event_id)
    const due = new Date(task.due_at)
    if (Number.isNaN(due.getTime())) {
      await input.log("Task due_at is invalid; skipping.")
      return
    }

    const end = new Date(due.getTime() + 30 * 60 * 1000)
    const body = {
      summary: task.title,
      start: { dateTime: due.toISOString() },
      end: { dateTime: end.toISOString() },
    }

    await input.log(existingEventId ? "Updating Google Calendar event for task…" : "Creating Google Calendar event for task…")
    const { eventId } = await upsertEvent(accessToken, { calendarId, existingEventId: existingEventId || undefined, body })
    const nextMeta = { ...getObject(task.meta), google_event_id: eventId }
    await updateRecordMeta(supabase, "tasks", task.id, nextMeta)
    await input.log(`Saved google_event_id=${eventId}`)
    return
  }

  if (input.action === "push_plan") {
    const { data, error } = await supabase.from("plans").select("id,title,start_date,end_date,meta").eq("id", input.recordId).single()
    if (error) throw error
    const plan = data as PlanRow
    const startDate = plan.start_date
    if (!startDate) {
      await input.log("Plan has no start_date; skipping Google Calendar event.")
      return
    }

    const endDateInclusive = plan.end_date ?? startDate
    const endExclusive = addDaysIsoDate(endDateInclusive, 1)

    const existingEventId = getString(getObject(plan.meta).google_event_id)
    const body = {
      summary: plan.title,
      start: { date: startDate },
      end: { date: endExclusive },
    }

    await input.log(existingEventId ? "Updating Google Calendar event for plan…" : "Creating Google Calendar event for plan…")
    const { eventId } = await upsertEvent(accessToken, { calendarId, existingEventId: existingEventId || undefined, body })
    const nextMeta = { ...getObject(plan.meta), google_event_id: eventId }
    await updateRecordMeta(supabase, "plans", plan.id, nextMeta)
    await input.log(`Saved google_event_id=${eventId}`)
    return
  }

  if (input.action === "push_subscription") {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,service,renewal_date,meta")
      .eq("id", input.recordId)
      .single()
    if (error) throw error
    const sub = data as SubscriptionRow
    if (!sub.renewal_date) {
      await input.log("Subscription has no renewal_date; skipping Google Calendar event.")
      return
    }

    const existingEventId = getString(getObject(sub.meta).google_event_id)
    const endExclusive = addDaysIsoDate(sub.renewal_date, 1)
    const body = {
      summary: `Renew: ${sub.service}`,
      start: { date: sub.renewal_date },
      end: { date: endExclusive },
    }

    await input.log(existingEventId ? "Updating Google Calendar event for subscription…" : "Creating Google Calendar event for subscription…")
    const { eventId } = await upsertEvent(accessToken, { calendarId, existingEventId: existingEventId || undefined, body })
    const nextMeta = { ...getObject(sub.meta), google_event_id: eventId }
    await updateRecordMeta(supabase, "subscriptions", sub.id, nextMeta)
    await input.log(`Saved google_event_id=${eventId}`)
    return
  }

  // Exhaustiveness guard.
  const neverAction: never = input.action
  throw new Error(`Unsupported action: ${neverAction}`)
}

