import type { SupabaseClient } from "@supabase/supabase-js"

import type { IntegrationRow, SyncAction, TargetType } from "@/lib/sync/types"
import { addDaysIsoDate, getObject, getString, isRecord } from "@/lib/sync/shared"

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`)
  return v
}

type OAuthTokenRow = {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  scope: string | null
}

async function refreshGoogleAccessToken(input: { userId: string; refreshToken: string }): Promise<{ accessToken: string; expiresAtIso: string }> {
  if (!input.refreshToken) throw new Error("Missing refresh token")

  const clientId = getEnv("GOOGLE_CLIENT_ID")
  const clientSecret = getEnv("GOOGLE_CLIENT_SECRET")

  console.log(`[googleCalendar] refresh attempt user_id=${input.userId}`)
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
  tokens: OAuthTokenRow
): Promise<{ accessToken: string; tokens: OAuthTokenRow }> {
  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : null
  const now = Date.now()
  const needsRefresh = expiresAt === null || !Number.isFinite(expiresAt) || expiresAt - now < 60_000

  if (!needsRefresh) return { accessToken: tokens.access_token, tokens }

  console.log(`[googleCalendar] token expired user_id=${tokens.user_id} expires_at=${tokens.expires_at ?? ""}`)
  const refreshToken = tokens.refresh_token?.trim() ?? ""
  if (!refreshToken) {
    console.warn(`[googleCalendar] token missing refresh_token user_id=${tokens.user_id}`)
    throw new Error("Missing refresh token")
  }

  const { accessToken, expiresAtIso } = await refreshGoogleAccessToken({ userId: tokens.user_id, refreshToken })
  const { data, error } = await supabase
    .from("oauth_tokens")
    .update({ access_token: accessToken, expires_at: expiresAtIso })
    .eq("id", tokens.id)
    .select("id,user_id,provider,access_token,refresh_token,expires_at,scope")
    .single()

  if (error) throw error
  return { accessToken, tokens: data as OAuthTokenRow }
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

async function getExternalId(
  supabase: SupabaseClient,
  input: { userId: string; provider: "google"; targetType: string; targetId: string }
): Promise<string | null> {
  const { data, error } = await supabase
    .from("external_links")
    .select("external_id")
    .eq("user_id", input.userId)
    .eq("provider", input.provider)
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .maybeSingle()
  if (error) return null
  const id = typeof (data as any)?.external_id === "string" ? String((data as any).external_id) : ""
  return id.trim() ? id.trim() : null
}

async function upsertExternalId(
  supabase: SupabaseClient,
  input: { userId: string; provider: "google"; targetType: string; targetId: string; externalId: string }
) {
  await supabase
    .from("external_links")
    .upsert(
      {
        user_id: input.userId,
        provider: input.provider,
        target_type: input.targetType,
        target_id: input.targetId,
        external_id: input.externalId,
      },
      { onConflict: "user_id,provider,target_type,target_id" }
    )
}

async function deleteExternalId(
  supabase: SupabaseClient,
  input: { userId: string; provider: "google"; targetType: string; targetId: string }
) {
  await supabase
    .from("external_links")
    .delete()
    .eq("user_id", input.userId)
    .eq("provider", input.provider)
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
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
type SubscriptionRow = { id: string; service: string; renewal_date: string | null; reminder_days: number | null; meta: unknown }
type PersonRow = { id: string; name: string; birth_date: string | null; meta?: unknown }

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
  input: { action: SyncAction; targetType: string; targetId: string; log: (msg: string) => Promise<void> }
): Promise<{ eventId?: string }> {
  const meta = getObject(integration.metadata ?? integration.meta)
  const calendarId = getString(meta.calendar_id) || "primary"
  const { data: tokens, error: tokenErr } = await supabase
    .from("oauth_tokens")
    .select("id,user_id,provider,access_token,refresh_token,expires_at,scope")
    .eq("user_id", integration.user_id)
    .eq("provider", "google")
    .maybeSingle()
  if (tokenErr) throw tokenErr
  if (!tokens) {
    console.warn(`[googleCalendar] token missing (oauth_tokens) user_id=${integration.user_id}`)
    throw new Error("Google tokens not found")
  }

  const ensured = await ensureGoogleAccessToken(supabase, tokens as OAuthTokenRow)
  const accessToken = ensured.accessToken

  const userId = integration.user_id
  const targetType = input.targetType as TargetType | string
  const targetId = input.targetId

  // Delete path (best-effort; delete external link even if provider deletion fails).
  if (input.action === "delete") {
    const existing = await getExternalId(supabase, { userId, provider: "google", targetType, targetId })
    const existingFromMeta = async (): Promise<string | null> => {
      if (targetType === "task") {
        const { data } = await supabase.from("tasks").select("meta").eq("id", targetId).maybeSingle()
        return data ? getString(getObject((data as any).meta).google_event_id) : null
      }
      if (targetType === "subscription") {
        const { data } = await supabase.from("subscriptions").select("meta").eq("id", targetId).maybeSingle()
        return data ? getString(getObject((data as any).meta).google_event_id) : null
      }
      if (targetType === "plan") {
        const { data } = await supabase.from("plans").select("meta").eq("id", targetId).maybeSingle()
        return data ? getString(getObject((data as any).meta).google_event_id) : null
      }
      return null
    }
    const eventId = existing || (await existingFromMeta())
    if (eventId) {
      await input.log("Deleting Google Calendar event…")
      await googleCalendarRequest(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
        method: "DELETE",
      })
    }
    await deleteExternalId(supabase, { userId, provider: "google", targetType, targetId })
    await input.log("Deleted external link.")
    return {}
  }

  if (targetType === "task") {
    const { data, error } = await supabase.from("tasks").select("id,title,due_at,due_date,meta").eq("id", targetId).single()
    if (error) throw error
    const task = data as TaskRow
    const dueAt = task.due_at
    const dueDate = typeof (task as any).due_date === "string" ? String((task as any).due_date) : null
    const dueAtIso =
      dueAt && String(dueAt).trim()
        ? String(dueAt)
        : dueDate && dueDate.trim()
          ? new Date(`${dueDate}T09:00:00.000Z`).toISOString()
          : null
    if (!dueAtIso) {
      await input.log("Task has no due_at/due_date; skipping Google Calendar event.")
      return {}
    }

    const existingEventId =
      (await getExternalId(supabase, { userId, provider: "google", targetType: "task", targetId: task.id })) ??
      getString(getObject(task.meta).google_event_id)
    const due = new Date(dueAtIso)
    if (Number.isNaN(due.getTime())) {
      await input.log("Task due_at is invalid; skipping.")
      return {}
    }

    const end = new Date(due.getTime() + 30 * 60 * 1000)
    const body = {
      summary: task.title,
      start: { dateTime: due.toISOString() },
      end: { dateTime: end.toISOString() },
    }

    await input.log(existingEventId ? "Updating Google Calendar event for task…" : "Creating Google Calendar event for task…")
    const { eventId } = await upsertEvent(accessToken, { calendarId, existingEventId: existingEventId || undefined, body })
    await upsertExternalId(supabase, { userId, provider: "google", targetType: "task", targetId: task.id, externalId: eventId })
    const nextMeta = { ...getObject(task.meta), google_event_id: eventId }
    await updateRecordMeta(supabase, "tasks", task.id, nextMeta)
    await input.log(`Saved google_event_id=${eventId}`)
    return { eventId }
  }

  if (targetType === "plan") {
    const { data, error } = await supabase.from("plans").select("id,title,start_date,end_date,meta").eq("id", targetId).single()
    if (error) throw error
    const plan = data as PlanRow
    const startDate = plan.start_date
    if (!startDate) {
      await input.log("Plan has no start_date; skipping Google Calendar event.")
      return { eventId: undefined }
    }

    const endDateInclusive = plan.end_date ?? startDate
    const endExclusive = addDaysIsoDate(endDateInclusive, 1)

    const existingEventId =
      (await getExternalId(supabase, { userId, provider: "google", targetType: "plan", targetId: plan.id })) ??
      getString(getObject(plan.meta).google_event_id)
    const body = {
      summary: plan.title,
      start: { date: startDate },
      end: { date: endExclusive },
    }

    await input.log(existingEventId ? "Updating Google Calendar event for plan…" : "Creating Google Calendar event for plan…")
    const { eventId } = await upsertEvent(accessToken, { calendarId, existingEventId: existingEventId || undefined, body })
    await upsertExternalId(supabase, { userId, provider: "google", targetType: "plan", targetId: plan.id, externalId: eventId })
    const nextMeta = { ...getObject(plan.meta), google_event_id: eventId }
    await updateRecordMeta(supabase, "plans", plan.id, nextMeta)
    await input.log(`Saved google_event_id=${eventId}`)
    return { eventId }
  }

  if (targetType === "subscription") {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,service,renewal_date,reminder_days,meta")
      .eq("id", targetId)
      .single()
    if (error) throw error
    const sub = data as SubscriptionRow
    if (!sub.renewal_date) {
      await input.log("Subscription has no renewal_date; skipping Google Calendar event.")
      return { eventId: undefined }
    }

    const existingEventId =
      (await getExternalId(supabase, { userId, provider: "google", targetType: "subscription", targetId: sub.id })) ??
      getString(getObject(sub.meta).google_event_id)

    const reminderDays = typeof sub.reminder_days === "number" && sub.reminder_days > 0 ? Math.floor(sub.reminder_days) : 0
    const eventDate = reminderDays > 0 ? addDaysIsoDate(sub.renewal_date, -reminderDays) : sub.renewal_date
    const endExclusive = addDaysIsoDate(eventDate, 1)
    const body = {
      summary: `Renewal: ${sub.service}`,
      start: { date: eventDate },
      end: { date: endExclusive },
    }

    await input.log(existingEventId ? "Updating Google Calendar event for subscription…" : "Creating Google Calendar event for subscription…")
    const { eventId } = await upsertEvent(accessToken, { calendarId, existingEventId: existingEventId || undefined, body })
    await upsertExternalId(supabase, { userId, provider: "google", targetType: "subscription", targetId: sub.id, externalId: eventId })
    const nextMeta = { ...getObject(sub.meta), google_event_id: eventId }
    await updateRecordMeta(supabase, "subscriptions", sub.id, nextMeta)
    await input.log(`Saved google_event_id=${eventId}`)
    return { eventId }
  }

  if (targetType === "person") {
    const { data, error } = await supabase.from("people").select("id,name,birth_date").eq("id", targetId).single()
    if (error) throw error
    const person = data as PersonRow
    if (!person.birth_date) {
      await input.log("Person has no birth_date; skipping Google Calendar event.")
      return { eventId: undefined }
    }

    // Create a yearly recurring all-day event. Start at the next occurrence.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(person.birth_date)
    if (!m) {
      await input.log("birth_date is invalid; skipping.")
      return { eventId: undefined }
    }
    const mm = Number(m[2])
    const dd = Number(m[3])
    const now = new Date()
    const y = now.getUTCFullYear()
    const thisYear = new Date(Date.UTC(y, mm - 1, dd, 0, 0, 0))
    const startDate = thisYear.getTime() >= now.getTime() ? `${y}-${m[2]}-${m[3]}` : `${y + 1}-${m[2]}-${m[3]}`
    const endExclusive = addDaysIsoDate(startDate, 1)

    const existingEventId =
      (await getExternalId(supabase, { userId, provider: "google", targetType: "person", targetId: person.id })) ?? null
    const body = {
      summary: `Birthday: ${person.name}`,
      start: { date: startDate },
      end: { date: endExclusive },
      recurrence: ["RRULE:FREQ=YEARLY"],
    }
    await input.log(existingEventId ? "Updating Google Calendar event for birthday…" : "Creating Google Calendar event for birthday…")
    const { eventId } = await upsertEvent(accessToken, { calendarId, existingEventId: existingEventId || undefined, body })
    await upsertExternalId(supabase, { userId, provider: "google", targetType: "person", targetId: person.id, externalId: eventId })
    await input.log(`Saved google_event_id=${eventId}`)
    return { eventId }
  }

  throw new Error(`Unsupported target_type for Google Calendar: ${targetType}`)
}

