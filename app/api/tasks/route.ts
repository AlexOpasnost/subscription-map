import { NextResponse, type NextRequest } from "next/server"

import { enqueueSyncJobs } from "@/lib/sync/enqueueSyncJobs"
import { supabaseServer } from "@/lib/supabase/server"
import { GoogleReconnectRequiredError, upsertGoogleCalendarEventForUser } from "@/lib/google/calendar"

type TaskRow = {
  id: string
  user_id: string
  title: string
  due_at?: string | null
  due_date: string | null
  category?: string
  amount_cents?: number | null
  currency?: string
  status: string
  created_at: string
}

function isIsoDateOnly(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  return Number.isFinite(dt.getTime())
}

function isIsoDateTime(s: string): boolean {
  const dt = new Date(s)
  return Number.isFinite(dt.getTime())
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const title = typeof (body as any)?.title === "string" ? String((body as any).title).trim() : ""
  const dueDateRaw = (body as any)?.due_date
  const due_date =
    dueDateRaw === null || typeof dueDateRaw === "undefined"
      ? null
      : typeof dueDateRaw === "string"
        ? dueDateRaw.trim()
        : ""
  const dueAtRaw = (body as any)?.due_at
  const due_at =
    dueAtRaw === null || typeof dueAtRaw === "undefined"
      ? null
      : typeof dueAtRaw === "string"
        ? dueAtRaw.trim()
        : ""
  const category = typeof (body as any)?.category === "string" ? String((body as any).category).trim() : ""
  const amountCentsRaw = (body as any)?.amount_cents
  const amount_cents =
    typeof amountCentsRaw === "number" && Number.isFinite(amountCentsRaw) && amountCentsRaw > 0
      ? Math.floor(amountCentsRaw)
      : null
  const currency = typeof (body as any)?.currency === "string" ? String((body as any).currency).trim().toUpperCase() : ""

  if (!title) {
    return NextResponse.json({ ok: false, error: "Missing title" }, { status: 400 })
  }
  if (title.length > 200) {
    return NextResponse.json({ ok: false, error: "Title is too long (max 200 characters)" }, { status: 400 })
  }
  if (due_date && !isIsoDateOnly(due_date)) {
    return NextResponse.json({ ok: false, error: "Invalid due_date. Use YYYY-MM-DD." }, { status: 400 })
  }
  if (due_at && !isIsoDateTime(due_at)) {
    return NextResponse.json({ ok: false, error: "Invalid due_at. Use an ISO timestamp." }, { status: 400 })
  }

  const supabase = await supabaseServer()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error("[tasks] auth.getUser error", authError)
    return NextResponse.json({ ok: false, error: authError.message }, { status: 401 })
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })
  }

  const { data: created, error: insertError } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title,
      due_date,
      due_at: due_at || null,
      category: category ? category.slice(0, 30) : "general",
      amount_cents,
      currency: currency ? currency.slice(0, 8) : "USD",
      status: "open",
    })
    .select("id,user_id,title,due_at,due_date,category,amount_cents,currency,status,created_at")
    .single()

  if (insertError) {
    console.error("[tasks] insert error", insertError)
    return NextResponse.json({ ok: false, error: insertError.message, details: insertError }, { status: 500 })
  }

  const shouldSyncGoogleForTask = Boolean((created as any)?.due_at) || Boolean((created as any)?.due_date)
  const sync = shouldSyncGoogleForTask
    ? await enqueueSyncJobs(supabase, { userId: user.id, provider: "google", action: "upsert", targetType: "task", targetId: created.id })
    : { enqueued: 0 }

  // Also create the Calendar event immediately (no worker required). Best-effort only.
  let google: { ok: boolean; status?: string; eventId?: string; error?: string } | null = null
  if (shouldSyncGoogleForTask) {
    try {
      const out = await upsertGoogleCalendarEventForUser(supabase, {
        userId: user.id,
        title: created.title,
        dueAt: (created as any)?.due_at ?? null,
        dueDate: (created as any)?.due_date ?? null,
        calendarId: "primary",
        existingEventId: null,
      })

      // Persist idempotency columns.
      await supabase.from("tasks").update({ google_event_id: out.eventId, google_calendar_id: out.calendarId }).eq("id", created.id)

      console.log("[tasks] google push ok", { userId: user.id, taskId: created.id, kind: out.kind, eventId: out.eventId })
      google = { ok: true, status: "ok", eventId: out.eventId }
    } catch (err: unknown) {
      if (err instanceof GoogleReconnectRequiredError) {
        console.warn("[tasks] google push skipped (NO_REFRESH_TOKEN)", { userId: user.id, taskId: created.id })
        google = { ok: false, error: "NEEDS_RECONNECT" }
      } else {
        const msg = err instanceof Error ? err.message : "Google push failed"
        if (msg === "GOOGLE_NOT_CONNECTED") {
          console.log("[tasks] google not connected", { userId: user.id, taskId: created.id })
          google = { ok: false, error: "NOT_CONNECTED" }
        } else if (msg === "MISSING_DUE_AT_OR_DUE_DATE") {
          console.log("[tasks] google push skipped (no due)", { userId: user.id, taskId: created.id })
          google = { ok: false, error: "SKIPPED_NO_DUE" }
        } else {
          console.error("[tasks] google push failed", { userId: user.id, taskId: created.id, error: msg })
          google = { ok: false, error: msg }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, task: created as TaskRow, sync, google })
}

