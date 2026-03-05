import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

type Channel = "inapp" | "email" | "telegram"
type Status = "pending" | "sending" | "sent" | "failed"

type NotificationRow = {
  id: string
  user_id: string
  channel: Channel
  title: string
  body: string | null
  status: Status
  run_at: string
  sent_at: string | null
  attempts: number
  last_error: string | null
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin()

  // Auth:
  // - cron mode: global processing (x-vercel-cron: 1 OR ?cron=1&key=...)
  // - user mode: cookie-auth, process only that user
  const cronHeader = (req.headers.get("x-vercel-cron") ?? "").trim()
  const cronQuery = (req.nextUrl.searchParams.get("cron") ?? "").trim()
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim()
  const cronSecret = (process.env.NOTIFICATIONS_CRON_SECRET ?? "").trim()

  const cron = cronHeader === "1" || cronQuery === "1"
  const cronAuthed = cronHeader === "1" || (cronQuery === "1" && Boolean(cronSecret) && key === cronSecret)
  if (cron && !cronAuthed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const authSb = await supabaseServer()
  const {
    data: { user },
  } = await authSb.auth.getUser()

  const onlyUserId = cron ? null : user?.id ?? null
  if (!cron && !onlyUserId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const limit = 50
  const ts = nowIso()
  console.log("[notifications/run] start", { cron, onlyUserId, limit })

  // 1) Select candidates.
  const candidatesQuery = onlyUserId
    ? admin
        .from("notifications")
        .select("id,user_id,channel,title,body,status,run_at,sent_at,attempts,last_error")
        .eq("user_id", onlyUserId)
        .eq("status", "pending")
        .lte("run_at", ts)
        .lt("attempts", 5)
        .order("run_at", { ascending: true })
        .limit(limit)
    : admin
        .from("notifications")
        .select("id,user_id,channel,title,body,status,run_at,sent_at,attempts,last_error")
        .eq("status", "pending")
        .lte("run_at", ts)
        .lt("attempts", 5)
        .order("run_at", { ascending: true })
        .limit(limit)

  const { data: candidates, error: candErr } = await candidatesQuery
  if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 })
  const rows = (candidates ?? []) as NotificationRow[]
  if (rows.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, ids: [] as string[] })
  }

  let processed = 0
  let sent = 0
  let failed = 0
  const ids: string[] = []

  for (const n of rows) {
    processed += 1
    try {
      // Mark as sending + bump attempts.
      const { error: sendingErr } = await admin
        .from("notifications")
        .update({ status: "sending" as Status, attempts: (n.attempts ?? 0) + 1, last_error: null })
        .eq("id", n.id)
        .eq("status", "pending")
      if (sendingErr) throw sendingErr

      // MVP: In-app is always "sent" immediately.
      // TODO: integrate actual delivery for email (Resend) and telegram (Bot API).
      const { error: sentErr } = await admin
        .from("notifications")
        .update({ status: "sent" as Status, sent_at: nowIso(), last_error: null })
        .eq("id", n.id)
        .eq("status", "sending")
      if (sentErr) throw sentErr

      sent += 1
      ids.push(n.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Notification send failed"
      await admin
        .from("notifications")
        .update({ status: "failed" as Status, last_error: msg.slice(0, 800) })
        .eq("id", n.id)
      failed += 1
      ids.push(n.id)
    }
  }

  console.log("[notifications/run] done", { cron, onlyUserId, processed, sent, failed })
  return NextResponse.json({ processed, sent, failed, ids })
}

