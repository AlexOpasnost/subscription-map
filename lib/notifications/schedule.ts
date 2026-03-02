import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

type NotificationChannel = "in_app" | "email" | "telegram"
type NotificationStatus = "pending" | "processing" | "sent" | "failed" | "cancelled"

type UserSettingsRow = {
  user_id: string
  email_enabled: boolean
  telegram_enabled: boolean
  telegram_chat_id: string | null
  timezone: string | null
  quiet_hours: unknown
  default_lead_minutes: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function asInt(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback
}

export async function getOrCreateUserNotificationSettings(
  admin: SupabaseClient,
  userId: string
): Promise<UserSettingsRow> {
  const { data, error } = await admin
    .from("user_notification_settings")
    .select("user_id,email_enabled,telegram_enabled,telegram_chat_id,timezone,quiet_hours,default_lead_minutes")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  if (data) {
    const row = data as any
    return {
      user_id: userId,
      email_enabled: asBool(row.email_enabled, true),
      telegram_enabled: asBool(row.telegram_enabled, false),
      telegram_chat_id: typeof row.telegram_chat_id === "string" ? row.telegram_chat_id : null,
      timezone: typeof row.timezone === "string" ? row.timezone : "UTC",
      quiet_hours: row.quiet_hours ?? {},
      default_lead_minutes: asInt(row.default_lead_minutes, 1440),
    }
  }

  const insert = {
    user_id: userId,
    email_enabled: true,
    telegram_enabled: false,
    telegram_chat_id: null,
    timezone: "UTC",
    quiet_hours: {},
    default_lead_minutes: 1440,
  }
  const { data: created, error: insErr } = await admin
    .from("user_notification_settings")
    .insert(insert)
    .select("user_id,email_enabled,telegram_enabled,telegram_chat_id,timezone,quiet_hours,default_lead_minutes")
    .single()
  if (insErr) throw insErr
  const row = created as any
  return {
    user_id: userId,
    email_enabled: asBool(row.email_enabled, true),
    telegram_enabled: asBool(row.telegram_enabled, false),
    telegram_chat_id: typeof row.telegram_chat_id === "string" ? row.telegram_chat_id : null,
    timezone: typeof row.timezone === "string" ? row.timezone : "UTC",
    quiet_hours: row.quiet_hours ?? {},
    default_lead_minutes: asInt(row.default_lead_minutes, 1440),
  }
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000)
}

function computeRunAt(input: { dueAtIso: string; leadMinutes: number }): string {
  const due = new Date(input.dueAtIso)
  const run = addMinutes(due, -Math.max(0, input.leadMinutes))
  return run.toISOString()
}

function dueAtFromTask(input: { due_at?: string | null; due_date?: string | null }): { dueAtIso: string; kind: "timed" | "all_day" } | null {
  const dueAt = input.due_at && String(input.due_at).trim() ? String(input.due_at) : ""
  if (dueAt) {
    const dt = new Date(dueAt)
    if (!Number.isFinite(dt.getTime())) return null
    return { dueAtIso: dt.toISOString(), kind: "timed" }
  }

  const dueDate = input.due_date && String(input.due_date).trim() ? String(input.due_date) : ""
  if (dueDate) {
    // MVP: interpret date-only as 09:00 UTC on that date for scheduling.
    const dt = new Date(`${dueDate}T09:00:00.000Z`)
    if (!Number.isFinite(dt.getTime())) return null
    return { dueAtIso: dt.toISOString(), kind: "all_day" }
  }

  return null
}

function addDaysIsoDate(dateOnly: string, days: number): string {
  const dt = new Date(`${dateOnly}T00:00:00.000Z`)
  if (!Number.isFinite(dt.getTime())) return dateOnly
  return new Date(dt.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function dueAtFromSubscription(input: { renewal_date?: string | null; reminder_days?: number | null }): { dueAtIso: string; dateOnly: string } | null {
  const renewal = input.renewal_date && String(input.renewal_date).trim() ? String(input.renewal_date).trim() : ""
  if (!renewal) return null
  const reminderDays = typeof input.reminder_days === "number" && Number.isFinite(input.reminder_days) && input.reminder_days > 0 ? Math.floor(input.reminder_days) : 0
  const eventDate = reminderDays > 0 ? addDaysIsoDate(renewal, -reminderDays) : renewal
  const dt = new Date(`${eventDate}T09:00:00.000Z`)
  if (!Number.isFinite(dt.getTime())) return null
  return { dueAtIso: dt.toISOString(), dateOnly: eventDate }
}

async function upsertPendingNotificationByMetaId(
  admin: SupabaseClient,
  input: {
    userId: string
    channel: NotificationChannel
    type: string
    metaKey: "task_id" | "subscription_id"
    metaId: string
    title: string
    body: string | null
    runAtIso: string
  }
): Promise<{ id: string; action: "inserted" | "updated" }> {
  const { data: existing, error } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", input.userId)
    .eq("channel", input.channel)
    .eq("type", input.type)
    .eq("status", "pending")
    .eq(`meta->>${input.metaKey}`, input.metaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  const meta = { [input.metaKey]: input.metaId }

  if (existing && typeof (existing as any).id === "string") {
    const id = String((existing as any).id)
    const { error: updErr } = await admin
      .from("notifications")
      .update({
        title: input.title,
        body: input.body,
        run_at: input.runAtIso,
        meta,
        last_error: null,
      })
      .eq("id", id)
      .eq("status", "pending")
    if (updErr) throw updErr
    return { id, action: "updated" }
  }

  const { data: inserted, error: insErr } = await admin
    .from("notifications")
    .insert({
      user_id: input.userId,
      channel: input.channel,
      type: input.type,
      title: input.title,
      body: input.body,
      status: "pending" as NotificationStatus,
      run_at: input.runAtIso,
      meta,
    })
    .select("id")
    .single()
  if (insErr) throw insErr
  return { id: String((inserted as any).id), action: "inserted" }
}

async function cancelPendingNotificationsByMetaId(
  admin: SupabaseClient,
  input: { userId: string; metaKey: "task_id" | "subscription_id"; metaId: string; types: string[] }
): Promise<void> {
  await admin
    .from("notifications")
    .update({ status: "cancelled" as NotificationStatus })
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .in("type", input.types)
    .eq(`meta->>${input.metaKey}`, input.metaId)
}

export async function scheduleTaskNotifications(
  admin: SupabaseClient,
  input: { userId: string; taskId: string; title: string; due_at?: string | null; due_date?: string | null }
): Promise<{ scheduled: number; skipped: boolean; reason?: string }> {
  const due = dueAtFromTask({ due_at: input.due_at ?? null, due_date: input.due_date ?? null })
  if (!due) {
    await cancelPendingNotificationsByMetaId(admin, { userId: input.userId, metaKey: "task_id", metaId: input.taskId, types: ["task_due"] })
    return { scheduled: 0, skipped: true, reason: "NO_DUE_DATE" }
  }

  const settings = await getOrCreateUserNotificationSettings(admin, input.userId)
  const runAtIso = computeRunAt({ dueAtIso: due.dueAtIso, leadMinutes: settings.default_lead_minutes })

  const title = `Task due: ${input.title || "Task"}`
  const body = due.kind === "timed" ? `Your task is due at ${due.dueAtIso}.` : `Your task is due on ${asString(input.due_date)}.`

  let scheduled = 0
  await upsertPendingNotificationByMetaId(admin, {
    userId: input.userId,
    channel: "in_app",
    type: "task_due",
    metaKey: "task_id",
    metaId: input.taskId,
    title,
    body,
    runAtIso,
  })
  scheduled += 1

  if (settings.email_enabled) {
    await upsertPendingNotificationByMetaId(admin, {
      userId: input.userId,
      channel: "email",
      type: "task_due",
      metaKey: "task_id",
      metaId: input.taskId,
      title,
      body,
      runAtIso,
    })
    scheduled += 1
  }

  return { scheduled, skipped: false }
}

export async function scheduleSubscriptionNotifications(
  admin: SupabaseClient,
  input: {
    userId: string
    subscriptionId: string
    service: string
    renewal_date?: string | null
    reminder_days?: number | null
  }
): Promise<{ scheduled: number; skipped: boolean; reason?: string }> {
  const due = dueAtFromSubscription({ renewal_date: input.renewal_date ?? null, reminder_days: input.reminder_days ?? null })
  if (!due) {
    await cancelPendingNotificationsByMetaId(admin, {
      userId: input.userId,
      metaKey: "subscription_id",
      metaId: input.subscriptionId,
      types: ["subscription_renewal"],
    })
    return { scheduled: 0, skipped: true, reason: "NO_RENEWAL_DATE" }
  }

  const settings = await getOrCreateUserNotificationSettings(admin, input.userId)
  const runAtIso = computeRunAt({ dueAtIso: due.dueAtIso, leadMinutes: settings.default_lead_minutes })

  const title = `Subscription renewal: ${input.service || "Subscription"}`
  const body = `Upcoming renewal on ${due.dateOnly}.`

  let scheduled = 0
  await upsertPendingNotificationByMetaId(admin, {
    userId: input.userId,
    channel: "in_app",
    type: "subscription_renewal",
    metaKey: "subscription_id",
    metaId: input.subscriptionId,
    title,
    body,
    runAtIso,
  })
  scheduled += 1

  if (settings.email_enabled) {
    await upsertPendingNotificationByMetaId(admin, {
      userId: input.userId,
      channel: "email",
      type: "subscription_renewal",
      metaKey: "subscription_id",
      metaId: input.subscriptionId,
      title,
      body,
      runAtIso,
    })
    scheduled += 1
  }

  return { scheduled, skipped: false }
}

