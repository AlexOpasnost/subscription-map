import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

type Channel = "in_app" | "email" | "telegram"
type Status = "pending" | "processing" | "sent" | "failed"

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
  return NextResponse.json({ ok: false, error: "Method not allowed. Use POST." }, { status: 405 })
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin()

  // Auth:
  // - cron mode: global processing (x-vercel-cron: 1 OR ?cron_secret=...)
  // - user mode: cookie-auth, process only that user
  const cronHeader = (req.headers.get("x-vercel-cron") ?? "").trim()
  const cronSecretQuery = (req.nextUrl.searchParams.get("cron_secret") ?? "").trim()
  const cronSecret = (process.env.NOTIFICATIONS_CRON_SECRET ?? "").trim()

  const cron = cronHeader === "1" || Boolean(cronSecretQuery)
  // If NOTIFICATIONS_CRON_SECRET is set, require it when using query auth.
  const cronAuthed = cronHeader === "1" || (!cronSecret ? Boolean(cronSecretQuery) : cronSecretQuery === cronSecret)
  if (cron && !cronAuthed) return NextResponse.json({ processed: 0, sent: 0, failed: 0, errors: ["Unauthorized"], ids: [] }, { status: 401 })

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
  if (candErr) return NextResponse.json({ processed: 0, sent: 0, failed: 0, errors: [candErr.message] }, { status: 500 })
  const rows = (candidates ?? []) as NotificationRow[]
  if (rows.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, errors: [], ids: [] as string[] })
  }

  let processed = 0
  let sent = 0
  let failed = 0
  const errors: string[] = []
  const ids: string[] = []

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

      // MVP: only implement in_app delivery; others are skipped for now (marked sent).
      // TODO: integrate email + telegram delivery.
      const { error: sentErr } = await admin
        .from("notifications")
        .update({ status: "sent" as Status, sent_at: nowIso(), last_error: null })
        .eq("id", n.id)
        .eq("status", "processing")
      if (sentErr) throw sentErr

      sent += 1
      ids.push(n.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Notification send failed"
      errors.push(msg)
      await admin
        .from("notifications")
        .update({ status: "failed" as Status, last_error: msg.slice(0, 800) })
        .eq("id", n.id)
      failed += 1
      ids.push(n.id)
    }
  }

  console.log("[notifications/run] done", { cron, onlyUserId, processed, sent, failed })
  return NextResponse.json({ processed, sent, failed, errors, ids })
}

