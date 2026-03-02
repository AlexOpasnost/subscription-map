import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { sendEmail } from "@/lib/notifications/email"

type Channel = "in_app" | "email" | "telegram"
type Status = "pending" | "processing" | "sent" | "failed" | "cancelled"

type NotificationRow = {
  id: string
  user_id: string
  channel: Channel
  type: string
  title: string
  body: string | null
  status: Status
  run_at: string
  sent_at: string | null
  attempts: number
  last_error: string | null
  meta: unknown
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin()
  const token = getBearerToken(req)
  const cronSecret = (process.env.NOTIFICATIONS_RUN_SECRET ?? "").trim()

  // Auth:
  // - cookie user: drain only that user
  // - cron bearer token: drain globally
  const authSb = await supabaseServer()
  const {
    data: { user },
  } = await authSb.auth.getUser()

  const cron = Boolean(cronSecret && token === cronSecret)
  const onlyUserId = cron ? null : user?.id ?? null
  if (!cron && !onlyUserId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const limit = 50
  const ts = nowIso()
  console.log("[notifications/run] start", { cron, onlyUserId, limit })

  // 1) Select candidates.
  const candidatesQuery = onlyUserId
    ? admin
        .from("notifications")
        .select("id,user_id,channel,type,title,body,status,run_at,sent_at,attempts,last_error,meta")
        .eq("user_id", onlyUserId)
        .eq("status", "pending")
        .lte("run_at", ts)
        .lt("attempts", 10)
        .order("run_at", { ascending: true })
        .limit(limit)
    : admin
        .from("notifications")
        .select("id,user_id,channel,type,title,body,status,run_at,sent_at,attempts,last_error,meta")
        .eq("status", "pending")
        .lte("run_at", ts)
        .lt("attempts", 10)
        .order("run_at", { ascending: true })
        .limit(limit)

  const { data: candidates, error: candErr } = await candidatesQuery
  if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 })
  const rows = (candidates ?? []) as NotificationRow[]
  if (rows.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, ids: { sent: [], failed: [] } })
  }

  // 2) Claim rows safely.
  const ids = rows.map((r) => r.id)
  const { data: claimed, error: claimErr } = await admin
    .from("notifications")
    .update({ status: "processing" as Status, last_error: null })
    .in("id", ids)
    .eq("status", "pending")
    .select("id,user_id,channel,type,title,body,status,run_at,sent_at,attempts,last_error,meta")

  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  const claimedRows = (claimed ?? []) as NotificationRow[]

  // Bump attempts for claimed rows (PostgREST can’t do attempts=attempts+1 directly without RPC).
  for (const r of claimedRows) {
    await admin
      .from("notifications")
      .update({ attempts: (r.attempts ?? 0) + 1 })
      .eq("id", r.id)
      .eq("status", "processing")
  }

  const emailCache = new Map<string, string>()
  async function getEmailForUser(userId: string): Promise<string> {
    const cached = emailCache.get(userId)
    if (cached) return cached
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error) throw new Error(error.message)
    const email = data?.user?.email ?? ""
    if (!email) throw new Error("Missing user email")
    emailCache.set(userId, email)
    return email
  }

  let processed = 0
  let sent = 0
  let failed = 0
  const sentIds: string[] = []
  const failedIds: string[] = []

  for (const n of claimedRows) {
    processed += 1
    try {
      if (n.channel === "in_app") {
        const { error } = await admin
          .from("notifications")
          .update({ status: "sent" as Status, sent_at: nowIso(), last_error: null })
          .eq("id", n.id)
        if (error) throw error
        sent += 1
        sentIds.push(n.id)
        continue
      }

      if (n.channel === "email") {
        const to = await getEmailForUser(n.user_id)
        const subject = n.title
        const text = (n.body ?? "").trim() || n.title
        const out = await sendEmail({ to, subject, text })
        const meta = { ...(typeof n.meta === "object" && n.meta !== null ? (n.meta as any) : {}), resend_id: out.id }
        const { error } = await admin
          .from("notifications")
          .update({ status: "sent" as Status, sent_at: nowIso(), last_error: null, meta })
          .eq("id", n.id)
        if (error) throw error
        sent += 1
        sentIds.push(n.id)
        continue
      }

      // Telegram is feature-flagged; cancel for MVP.
      const { error } = await admin
        .from("notifications")
        .update({ status: "cancelled" as Status, last_error: "TELEGRAM_DISABLED" })
        .eq("id", n.id)
      if (error) throw error
      failed += 1
      failedIds.push(n.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Notification send failed"
      await admin.from("notifications").update({ status: "failed" as Status, last_error: msg.slice(0, 800) }).eq("id", n.id)
      failed += 1
      failedIds.push(n.id)
    }
  }

  console.log("[notifications/run] done", { cron, onlyUserId, processed, sent, failed })
  return NextResponse.json({ processed, sent, failed, ids: { sent: sentIds, failed: failedIds } })
}

