import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { sendEmailIfConfigured } from "@/lib/notifications/email"

type Channel = "in_app" | "email" | "telegram"
type Status = "pending" | "processing" | "sent" | "error"

type NotificationRow = {
  id: string
  user_id: string
  channel: Channel
  title: string
  body: string
  status: Status
  run_at: string
  sent_at: string | null
  attempts: number
  last_error: string | null
  source_type: "task" | "subscription" | "manual"
  source_id: string | null
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function GET(req: NextRequest) {
  // Vercel Cron uses GET. Keep GET and route it into the same logic as POST.
  return POST(req)
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin()

  // Auth:
  // - cron mode: global processing (x-vercel-cron: 1 OR ?secret=...)
  // - user mode: cookie-auth, process only that user
  const cronHeader = (req.headers.get("x-vercel-cron") ?? "").trim()
  const cronSecretQuery = (req.nextUrl.searchParams.get("secret") ?? "").trim()
  const cronSecret = (process.env.NOTIFICATIONS_CRON_SECRET ?? "").trim()

  const cron = cronHeader === "1" || Boolean(cronSecretQuery)
  const cronAuthed = cronHeader === "1" || (!cronSecret ? Boolean(cronSecretQuery) : cronSecretQuery === cronSecret)
  if (cron && !cronAuthed) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, results: [], errors: ["Unauthorized"] }, { status: 401 })
  }

  const authSb = await supabaseServer()
  const {
    data: { user },
  } = await authSb.auth.getUser()

  const onlyUserId = cron ? null : user?.id ?? null
  if (!cron && !onlyUserId) return NextResponse.json({ processed: 0, sent: 0, failed: 0, results: [], errors: ["Not authenticated"] }, { status: 401 })

  const limit = 20
  const ts = nowIso()
  console.log("[notifications/run] start", { cron, onlyUserId, limit })

  async function logLine(input: { userId: string | null; notificationId: string | null; message: string }) {
    const { error } = await admin.from("notification_logs").insert({
      user_id: input.userId,
      notification_id: input.notificationId,
      message: input.message,
    })
    if (error) {
      // Optional table; ignore errors (e.g. table missing).
      return
    }
  }

  async function getOrCreateSettings(userId: string): Promise<{ preferred_channel: Channel; email: string | null; telegram_chat_id: string | null; tz: string }> {
    const { data, error } = await admin
      .from("user_notification_settings")
      .select("user_id,email,telegram_chat_id,preferred_channel,tz")
      .eq("user_id", userId)
      .maybeSingle()
    if (error) throw error
    if (data) {
      return {
        preferred_channel: (data as any).preferred_channel ?? "email",
        email: typeof (data as any).email === "string" ? String((data as any).email) : null,
        telegram_chat_id: typeof (data as any).telegram_chat_id === "string" ? String((data as any).telegram_chat_id) : null,
        tz: typeof (data as any).tz === "string" ? String((data as any).tz) : "UTC",
      }
    }
    const insert = { user_id: userId, email: null, telegram_chat_id: null, preferred_channel: "email", tz: "UTC" }
    const { data: created, error: insErr } = await admin
      .from("user_notification_settings")
      .insert(insert)
      .select("user_id,email,telegram_chat_id,preferred_channel,tz")
      .single()
    if (insErr) throw insErr
    return {
      preferred_channel: (created as any).preferred_channel ?? "email",
      email: typeof (created as any).email === "string" ? String((created as any).email) : null,
      telegram_chat_id: typeof (created as any).telegram_chat_id === "string" ? String((created as any).telegram_chat_id) : null,
      tz: typeof (created as any).tz === "string" ? String((created as any).tz) : "UTC",
    }
  }

  function runAtFromTask(t: { due_at: string | null; due_date: string | null }): string | null {
    if (t.due_at) {
      const dt = new Date(t.due_at)
      if (!Number.isFinite(dt.getTime())) return null
      return dt.toISOString()
    }
    if (t.due_date) {
      const dt = new Date(`${t.due_date}T09:00:00.000Z`)
      if (!Number.isFinite(dt.getTime())) return null
      return dt.toISOString()
    }
    return null
  }

  async function enqueueDueTaskNotifications(userId: string) {
    const now = new Date()
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const nowIso = now.toISOString()
    const toIso = to.toISOString()

    const { data: tasks, error } = await admin
      .from("tasks")
      .select("id,user_id,title,due_at,due_date")
      .eq("user_id", userId)
      .or(`due_at.gte.${nowIso},due_date.gte.${nowIso.slice(0, 10)}`)
      .limit(100)

    if (error) throw error
    const rows = (tasks ?? []) as Array<{ id: string; user_id: string; title: string; due_at: string | null; due_date: string | null }>
    if (rows.length === 0) return { considered: 0, inserted: 0 }

    const settings = await getOrCreateSettings(userId)
    let inserted = 0
    for (const t of rows) {
      const runAt = runAtFromTask({ due_at: t.due_at, due_date: t.due_date })
      if (!runAt) continue
      if (runAt > toIso) continue

      const { data: existing, error: existErr } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "pending")
        .eq("source_type", "task")
        .eq("source_id", t.id)
        .maybeSingle()
      if (existErr) throw existErr
      if (existing?.id) continue

      let channel: Channel = settings.preferred_channel
      if (channel === "email" && !settings.email) channel = "in_app"
      if (channel === "telegram" && !settings.telegram_chat_id) channel = "in_app"

      const title = `Task due: ${t.title || "Task"}`
      const body = t.due_at ? `Your task is due at ${t.due_at}.` : `Your task is due on ${t.due_date}.`
      const { error: insErr } = await admin.from("notifications").insert({
        user_id: userId,
        channel,
        title,
        body,
        run_at: runAt,
        status: "pending",
        source_type: "task",
        source_id: t.id,
      })
      if (insErr) throw insErr
      inserted += 1
    }

    return { considered: rows.length, inserted }
  }

  // Best-effort enqueue for "due soon" tasks.
  try {
    if (onlyUserId) {
      await enqueueDueTaskNotifications(onlyUserId)
    }
  } catch (err: unknown) {
    console.error("[notifications/run] enqueueDueTaskNotifications failed", err)
  }

  // 1) Select candidates.
  const candidatesQuery = onlyUserId
    ? admin
        .from("notifications")
        .select("id,user_id,channel,title,body,status,run_at,sent_at,attempts,last_error,source_type,source_id")
        .eq("user_id", onlyUserId)
        .eq("status", "pending")
        .lte("run_at", ts)
        .lt("attempts", 5)
        .order("run_at", { ascending: true })
        .limit(limit)
    : admin
        .from("notifications")
        .select("id,user_id,channel,title,body,status,run_at,sent_at,attempts,last_error,source_type,source_id")
        .eq("status", "pending")
        .lte("run_at", ts)
        .lt("attempts", 5)
        .order("run_at", { ascending: true })
        .limit(limit)

  const { data: candidates, error: candErr } = await candidatesQuery
  if (candErr) return NextResponse.json({ processed: 0, sent: 0, failed: 0, results: [], errors: [candErr.message] }, { status: 500 })
  const rows = (candidates ?? []) as NotificationRow[]
  if (rows.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, results: [], errors: [] })
  }

  let processed = 0
  let sent = 0
  let failed = 0
  const errors: string[] = []
  const results: Array<{ id: string; channel: Channel; status: "sent" | "error"; error?: string }> = []

  for (const n of rows) {
    processed += 1
    try {
      // Claim row: pending -> processing and bump attempts.
      const { error: claimErr } = await admin
        .from("notifications")
        .update({ status: "processing" as Status, attempts: (n.attempts ?? 0) + 1, last_error: null })
        .eq("id", n.id)
        .eq("status", "pending")
      if (claimErr) throw claimErr

      await logLine({ userId: n.user_id, notificationId: n.id, message: `claim channel=${n.channel} source_type=${n.source_type}` })

      if (n.channel === "in_app") {
        const { error: sentErr } = await admin
          .from("notifications")
          .update({ status: "sent" as Status, sent_at: nowIso(), last_error: null })
          .eq("id", n.id)
          .eq("status", "processing")
        if (sentErr) throw sentErr
      } else if (n.channel === "email") {
        const settings = await getOrCreateSettings(n.user_id)
        const to = settings.email
        if (!to) {
          throw new Error("No email configured for user")
        }
        const out = await sendEmailIfConfigured({ to, subject: n.title, text: n.body })
        if (!out.ok) {
          throw new Error(out.error)
        }
        const { error: sentErr } = await admin
          .from("notifications")
          .update({ status: "sent" as Status, sent_at: nowIso(), last_error: null })
          .eq("id", n.id)
          .eq("status", "processing")
        if (sentErr) throw sentErr
      } else {
        throw new Error("Telegram not implemented")
      }

      sent += 1
      results.push({ id: n.id, channel: n.channel, status: "sent" })
      await logLine({ userId: n.user_id, notificationId: n.id, message: "sent" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Notification send failed"
      errors.push(msg)
      await admin
        .from("notifications")
        .update({ status: "error" as Status, last_error: msg.slice(0, 800) })
        .eq("id", n.id)
      failed += 1
      results.push({ id: n.id, channel: n.channel, status: "error", error: msg })
      await logLine({ userId: n.user_id, notificationId: n.id, message: `error: ${msg}` })
    }
  }

  console.log("[notifications/run] done", { cron, onlyUserId, processed, sent, failed })
  return NextResponse.json({ processed, sent, failed, results, errors })
}

