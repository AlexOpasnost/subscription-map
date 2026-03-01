import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { GoogleReconnectRequiredError, upsertGoogleCalendarEventForUser } from "@/lib/google/calendar"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const taskId = isRecord(body) && typeof body.taskId === "string" ? body.taskId.trim() : ""
  if (!taskId) return NextResponse.json({ ok: false, error: "Missing taskId" }, { status: 400 })
  if (!isUuid(taskId)) return NextResponse.json({ ok: false, error: "Invalid taskId" }, { status: 400 })

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id,user_id,title,due_at,due_date,notes,google_event_id,google_calendar_id")
    .eq("id", taskId)
    .maybeSingle()

  if (taskErr) return NextResponse.json({ ok: false, error: taskErr.message }, { status: 500 })
  if (!task) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 })
  if (String((task as any).user_id ?? "") !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  const existingEventId = typeof (task as any).google_event_id === "string" ? String((task as any).google_event_id).trim() : ""
  const calendarId = typeof (task as any).google_calendar_id === "string" ? String((task as any).google_calendar_id).trim() : ""

  const dueAt = typeof (task as any).due_at === "string" ? String((task as any).due_at) : null
  const dueDate = typeof (task as any).due_date === "string" ? String((task as any).due_date) : null
  const notes = typeof (task as any).notes === "string" ? String((task as any).notes) : null
  const title = typeof (task as any).title === "string" ? String((task as any).title) : "Task"

  try {
    const out = await upsertGoogleCalendarEventForUser(supabase, {
      userId: user.id,
      title,
      description: notes,
      dueAt,
      dueDate,
      calendarId: calendarId || "primary",
      existingEventId: existingEventId || null,
    })

    // Persist idempotency columns.
    const { error: updErr } = await supabase
      .from("tasks")
      .update({ google_event_id: out.eventId, google_calendar_id: out.calendarId })
      .eq("id", taskId)
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })

    console.log("[integrations/google/push-task] ok", {
      userId: user.id,
      taskId,
      kind: out.kind,
      eventId: out.eventId,
      calendarId: out.calendarId,
    })
    return NextResponse.json({ ok: true, taskId, eventId: out.eventId, calendarId: out.calendarId })
  } catch (err: unknown) {
    if (err instanceof GoogleReconnectRequiredError) {
      console.warn("[integrations/google/push-task] NO_REFRESH_TOKEN", { userId: user.id, taskId })
      return NextResponse.json({ ok: false, error: "NO_REFRESH_TOKEN" }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : "Failed to push task"
    console.error("[integrations/google/push-task] error", { userId: user.id, taskId, msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

