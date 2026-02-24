import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { pushToGoogleCalendar } from "@/lib/sync/providers/googleCalendar"
import type { IntegrationRow } from "@/lib/sync/types"

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

  const { data: integration, error: intErr } = await supabase
    .from("integrations")
    .select("id,user_id,provider,access_token,refresh_token,expires_at,scope,meta,metadata,created_at,status")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle()

  if (intErr) return NextResponse.json({ ok: false, error: intErr.message }, { status: 500 })
  if (!integration) return NextResponse.json({ ok: false, error: "NOT_CONNECTED" }, { status: 400 })
  const status = typeof (integration as any)?.status === "string" ? String((integration as any).status) : ""
  if (status && status.toLowerCase() === "disconnected") {
    return NextResponse.json({ ok: false, error: "NOT_CONNECTED" }, { status: 400 })
  }

  // Best-effort job+log rows (if sync_jobs/sync_logs exist).
  let syncJobId: string | null = null
  try {
    const { data } = await supabase
      .from("sync_jobs")
      .insert({
        user_id: user.id,
        provider: "google",
        target_type: "task",
        target_id: taskId,
        action: "upsert",
        status: "pending",
        attempts: 0,
        last_error: null,
        legacy_action: "push_task",
        legacy_payload: { record_id: taskId },
        legacy_status: "queued",
      })
      .select("id")
      .single()
    syncJobId = typeof (data as any)?.id === "string" ? String((data as any).id) : null
  } catch {
    syncJobId = null
  }

  const log = async (message: string) => {
    console.log(`[integrations/google/sync-task] user_id=${user.id} task_id=${taskId} ${message}`)
    if (!syncJobId) return
    try {
      await supabase.from("sync_logs").insert({ user_id: user.id, sync_job_id: syncJobId, message })
    } catch {
      // ignore
    }
  }

  try {
    await log("start")
    const out = await pushToGoogleCalendar(supabase, integration as unknown as IntegrationRow, {
      action: "upsert",
      targetType: "task",
      targetId: taskId,
      log,
    })
    const eventId = out?.eventId

    // Fetch back column value (preferred).
    const { data: row } = await supabase.from("tasks").select("google_event_id").eq("id", taskId).maybeSingle()
    const googleEventId = typeof (row as any)?.google_event_id === "string" ? String((row as any).google_event_id) : null

    if (syncJobId) {
      try {
        await supabase.from("sync_jobs").update({ status: "ok", last_error: null, legacy_status: "ok", error: null } as any).eq("id", syncJobId)
      } catch {
        // ignore
      }
    }

    await log(`ok eventId=${eventId ?? ""}`)
    return NextResponse.json({ ok: true, taskId, google_event_id: googleEventId ?? eventId ?? null })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Sync failed"
    await log(`error ${msg}`)
    if (syncJobId) {
      try {
        await supabase
          .from("sync_jobs")
          .update({ status: "error", last_error: msg.slice(0, 600), legacy_status: "error", error: msg.slice(0, 600) } as any)
          .eq("id", syncJobId)
      } catch {
        // ignore
      }
    }
    if (msg.includes("Missing refresh token")) {
      return NextResponse.json({ ok: false, error: "NEEDS_RECONNECT" }, { status: 400 })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

