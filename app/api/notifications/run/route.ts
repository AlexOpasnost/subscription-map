import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

type Channel = "inapp" | "email" | "telegram"
type Status = "pending" | "sent" | "error"

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
  meta: Record<string, unknown> | null
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin()

  const authSb = await supabaseServer()
  const {
    data: { user },
  } = await authSb.auth.getUser()

  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const limit = 25
  const ts = nowIso()
  console.log("[notifications/run] start", { userId: user.id, limit })

  // 1) Select candidates.
  const { data: candidates, error: candErr } = await admin
    .from("notifications")
    .select("id,user_id,channel,title,body,status,run_at,sent_at,attempts,last_error,meta")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .lte("run_at", ts)
    .order("run_at", { ascending: true })
    .limit(limit)

  if (candErr) return NextResponse.json({ ok: false, error: candErr.message }, { status: 500 })
  const rows = (candidates ?? []) as NotificationRow[]

  let processed = 0
  let sent = 0
  let errored = 0

  for (const n of rows) {
    processed += 1
    try {
      const nextAttempts = (n.attempts ?? 0) + 1
      const meta = n.meta && typeof n.meta === "object" ? (n.meta as Record<string, unknown>) : {}
      const sentVia =
        n.channel === "email" ? "email_mock" : n.channel === "telegram" ? "telegram_mock" : "inapp"
      const nextMeta = n.channel === "inapp" ? meta : { ...meta, sent_via: sentVia }

      const { error: updErr } = await admin
        .from("notifications")
        .update({ attempts: nextAttempts, status: "sent" as Status, sent_at: nowIso(), last_error: null, meta: nextMeta })
        .eq("id", n.id)
        .eq("user_id", user.id)
      if (updErr) throw updErr

      sent += 1
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Notification send failed"
      await admin
        .from("notifications")
        .update({ status: "error" as Status, last_error: msg.slice(0, 800) })
        .eq("id", n.id)
        .eq("user_id", user.id)
      errored += 1
    }
  }

  console.log("[notifications/run] done", { userId: user.id, processed, sent, errored })
  return NextResponse.json({ ok: true, processed, sent, errored })
}

