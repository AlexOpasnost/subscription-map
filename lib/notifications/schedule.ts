import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

type UserSettingsRow = {
  user_id: string
  email_enabled: boolean
  email_address: string | null
  inapp_enabled: boolean
  telegram_enabled: boolean
  telegram_chat_id: string | null
  default_lead_minutes: number
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : ""
}

export async function getOrCreateUserNotificationSettings(
  admin: SupabaseClient,
  userId: string
): Promise<UserSettingsRow> {
  const { data, error } = await admin
    .from("user_notification_settings")
    .select("user_id,email_enabled,email_address,inapp_enabled,telegram_enabled,telegram_chat_id,default_lead_minutes")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  if (data) {
    const row = data as any
    return {
      user_id: userId,
      email_enabled: asBool(row.email_enabled, false),
      email_address: typeof row.email_address === "string" ? row.email_address : null,
      inapp_enabled: asBool(row.inapp_enabled, true),
      telegram_enabled: asBool(row.telegram_enabled, false),
      telegram_chat_id: typeof row.telegram_chat_id === "string" ? row.telegram_chat_id : null,
      default_lead_minutes: typeof row.default_lead_minutes === "number" && Number.isFinite(row.default_lead_minutes) ? Math.floor(row.default_lead_minutes) : 1440,
    }
  }

  const insert = {
    user_id: userId,
    email_enabled: false,
    email_address: null,
    inapp_enabled: true,
    telegram_enabled: false,
    telegram_chat_id: null,
    default_lead_minutes: 1440,
  }
  const { data: created, error: insErr } = await admin
    .from("user_notification_settings")
    .insert(insert)
    .select("user_id,email_enabled,email_address,inapp_enabled,telegram_enabled,telegram_chat_id,default_lead_minutes")
    .single()
  if (insErr) throw insErr
  const row = created as any
  return {
    user_id: userId,
    email_enabled: asBool(row.email_enabled, false),
    email_address: typeof row.email_address === "string" ? row.email_address : null,
    inapp_enabled: asBool(row.inapp_enabled, true),
    telegram_enabled: asBool(row.telegram_enabled, false),
    telegram_chat_id: typeof row.telegram_chat_id === "string" ? row.telegram_chat_id : null,
    default_lead_minutes: typeof row.default_lead_minutes === "number" && Number.isFinite(row.default_lead_minutes) ? Math.floor(row.default_lead_minutes) : 1440,
  }
}

function subtractMinutes(iso: string, minutes: number): string {
  const dt = new Date(iso)
  if (!Number.isFinite(dt.getTime())) return iso
  const ms = Math.max(0, Math.floor(minutes)) * 60_000
  return new Date(dt.getTime() - ms).toISOString()
}

function dueAtFromTask(input: {
  due_at?: string | null
  due_date?: string | null
}): { dueAtIso: string; kind: "timed" | "all_day" } | null {
  const dueAt = input.due_at && String(input.due_at).trim() ? String(input.due_at) : ""
  if (dueAt) {
    const dt = new Date(dueAt)
    if (!Number.isFinite(dt.getTime())) return null
    return { dueAtIso: dt.toISOString(), kind: "timed" }
  }

  const dueDate = input.due_date && String(input.due_date).trim() ? String(input.due_date) : ""
  if (dueDate) {
    // MVP: interpret date-only as 09:00 UTC for scheduling.
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

async function insertNotification(
  admin: SupabaseClient,
  input: { userId: string; channel: "in_app" | "email" | "telegram"; title: string; body: string | null; runAtIso: string; meta?: Record<string, unknown> }
): Promise<void> {
  const { error } = await admin.from("notifications").insert({
    user_id: input.userId,
    channel: input.channel,
    title: input.title,
    body: input.body,
    status: "pending",
    run_at: input.runAtIso,
    meta: input.meta ?? {},
  })
  if (error) throw error
}

export async function scheduleTaskNotifications(
  admin: SupabaseClient,
  input: { userId: string; taskId: string; title: string; due_at?: string | null; due_date?: string | null }
): Promise<{ scheduled: number; skipped: boolean; reason?: string }> {
  const due = dueAtFromTask({ due_at: input.due_at ?? null, due_date: input.due_date ?? null })
  if (!due) {
    return { scheduled: 0, skipped: true, reason: "NO_DUE_DATE" }
  }

  const settings = await getOrCreateUserNotificationSettings(admin, input.userId)
  const runAtIso = subtractMinutes(due.dueAtIso, settings.default_lead_minutes)

  const title = `Task due: ${input.title || "Task"}`
  const body = due.kind === "timed" ? `Your task is due at ${due.dueAtIso}.` : `Your task is due on ${asString(input.due_date)}.`

  let scheduled = 0
  if (settings.inapp_enabled) {
    await insertNotification(admin, { userId: input.userId, channel: "in_app", title, body, runAtIso, meta: { task_id: input.taskId } })
    scheduled += 1
  }

  if (settings.email_enabled && settings.email_address) {
    await insertNotification(admin, {
      userId: input.userId,
      channel: "email",
      title,
      body,
      runAtIso,
      meta: { task_id: input.taskId, email: settings.email_address },
    })
    scheduled += 1
  }

  if (settings.telegram_enabled && settings.telegram_chat_id) {
    await insertNotification(admin, { userId: input.userId, channel: "telegram", title, body, runAtIso, meta: { task_id: input.taskId, telegram_chat_id: settings.telegram_chat_id } })
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
    return { scheduled: 0, skipped: true, reason: "NO_RENEWAL_DATE" }
  }

  const settings = await getOrCreateUserNotificationSettings(admin, input.userId)
  const runAtIso = subtractMinutes(due.dueAtIso, settings.default_lead_minutes)

  const title = `Subscription renewal: ${input.service || "Subscription"}`
  const body = `Upcoming renewal on ${due.dateOnly}.`

  let scheduled = 0
  if (settings.inapp_enabled) {
    await insertNotification(admin, {
      userId: input.userId,
      channel: "in_app",
      title,
      body,
      runAtIso,
      meta: { subscription_id: input.subscriptionId },
    })
    scheduled += 1
  }

  if (settings.email_enabled && settings.email_address) {
    await insertNotification(admin, {
      userId: input.userId,
      channel: "email",
      title,
      body,
      runAtIso,
      meta: { subscription_id: input.subscriptionId, email: settings.email_address },
    })
    scheduled += 1
  }

  if (settings.telegram_enabled && settings.telegram_chat_id) {
    await insertNotification(admin, {
      userId: input.userId,
      channel: "telegram",
      title,
      body,
      runAtIso,
      meta: { subscription_id: input.subscriptionId, telegram_chat_id: settings.telegram_chat_id },
    })
    scheduled += 1
  }

  return { scheduled, skipped: false }
}

