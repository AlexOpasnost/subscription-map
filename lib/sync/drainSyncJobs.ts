import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { pushToGoogleCalendar } from "@/lib/sync/providers/googleCalendar"
import { pushToNotion } from "@/lib/sync/providers/notion"
import type { IntegrationRow, Provider, SyncAction, SyncJobRow } from "@/lib/sync/types"

function parseProvider(v: unknown): Provider | null {
  return v === "google" || v === "notion" ? v : null
}

function parseAction(v: unknown): SyncAction | null {
  return v === "upsert" || v === "delete" ? v : null
}

export async function insertSyncLog(
  supabase: SupabaseClient,
  job: { id: string; user_id: string },
  message: string
): Promise<void> {
  await supabase.from("sync_logs").insert({ sync_job_id: job.id, user_id: job.user_id, message })
}

async function logAssistantActivity(
  supabase: SupabaseClient,
  input: { userId: string; kind: string; command: string; result: Record<string, unknown> }
) {
  try {
    await supabase.from("assistant_activity").insert({
      user_id: input.userId,
      kind: input.kind,
      command: input.command,
      result: input.result,
      input_text: input.command,
      intent: {},
      status: "ok",
      error: null,
    })
  } catch {
    // ignore
  }
}

async function processJob(
  supabase: SupabaseClient,
  job: SyncJobRow
): Promise<{ eventId?: string }> {
  const provider = parseProvider(job.provider)
  const action = parseAction(job.action)
  const targetType = typeof (job as any).target_type === "string" ? String((job as any).target_type) : ""
  const targetId = typeof (job as any).target_id === "string" ? String((job as any).target_id) : ""
  if (!provider || !action || !targetType || !targetId) {
    throw new Error("Invalid job payload")
  }

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id,user_id,provider,access_token,refresh_token,expires_at,scope,meta,metadata,created_at,status")
    .eq("user_id", job.user_id)
    .eq("provider", provider)
    .maybeSingle()

  if (integrationError) throw integrationError
  if (!integration) throw new Error(`Integration not connected: ${provider}`)
  const status = typeof (integration as any).status === "string" ? String((integration as any).status).toLowerCase() : ""
  if (status === "disconnected") throw new Error(`Integration not connected: ${provider}`)

  const log = async (message: string) => {
    await insertSyncLog(supabase, job, message)
  }

  await log(`Running ${provider}:${action} for ${targetType}:${targetId}`)

  if (provider === "google") {
    const out = await pushToGoogleCalendar(supabase, integration as IntegrationRow, { action, targetType, targetId, log })
    return out ?? {}
  }

  if (provider === "notion") {
    await pushToNotion(supabase, integration as IntegrationRow, { action, targetType, targetId, log })
    return {}
  }

  const neverProvider: never = provider
  throw new Error(`Unsupported provider: ${neverProvider}`)
}

async function claimJob(supabase: SupabaseClient, jobId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("sync_jobs")
    // Keep spec column `status` as pending; use legacy_status as an internal lock.
    .update({ legacy_status: "running", last_error: null })
    .eq("id", jobId)
    .eq("status", "pending")
    .or("legacy_status.is.null,legacy_status.eq.queued,legacy_status.eq.pending")
    .select("id")
    .maybeSingle()

  if (error) throw error
  return !!data
}

async function markOk(supabase: SupabaseClient, jobId: string) {
  const { error } = await supabase.from("sync_jobs").update({ status: "ok", legacy_status: "ok", last_error: null }).eq("id", jobId)
  if (error) throw error
}

async function markError(supabase: SupabaseClient, jobId: string, message: string) {
  const { error } = await supabase.from("sync_jobs").update({ status: "error", legacy_status: "error", last_error: message }).eq("id", jobId)
  if (error) throw error
}

export type DrainSyncJobsResult = {
  processed: number
  ok: number
  failed: number
  results: Array<{
    id: string
    provider?: string
    target_type?: string
    target_id?: string
    status: "skipped" | "ok" | "error"
    error?: string
  }>
}

export async function drainSyncJobs(
  supabase: SupabaseClient,
  input?: { onlyUserId?: string | null; limit?: number }
): Promise<DrainSyncJobsResult> {
  const onlyUserId = input?.onlyUserId ?? null
  const limit = typeof input?.limit === "number" && input.limit > 0 ? Math.floor(input.limit) : 20

  const baseSelect =
    "id,user_id,provider,target_type,target_id,action,status,attempts,last_error,legacy_status,legacy_action,legacy_payload,created_at,updated_at"

  const { data: jobs, error } = onlyUserId
    ? await supabase
        .from("sync_jobs")
        .select(baseSelect)
        .eq("user_id", onlyUserId)
        .eq("status", "pending")
        .lt("attempts", 10)
        .or("legacy_status.is.null,legacy_status.eq.queued,legacy_status.eq.pending")
        .order("created_at", { ascending: true })
        .limit(limit)
    : await supabase
        .from("sync_jobs")
        .select(baseSelect)
        .eq("status", "pending")
        .lt("attempts", 10)
        .or("legacy_status.is.null,legacy_status.eq.queued,legacy_status.eq.pending")
        .order("created_at", { ascending: true })
        .limit(limit)

  if (error) throw error

  const queued = (jobs ?? []) as SyncJobRow[]
  let processed = 0
  let ok = 0
  let failed = 0
  const results: DrainSyncJobsResult["results"] = []

  for (const job of queued) {
    const claimed = await claimJob(supabase, job.id)
    if (!claimed) {
      results.push({ id: job.id, provider: job.provider, target_type: (job as any).target_type, target_id: (job as any).target_id, status: "skipped" })
      continue
    }
    processed += 1
    try {
      // Increment attempts early (best-effort) so retries are bounded even if execution crashes mid-flight.
      await supabase.from("sync_jobs").update({ attempts: (job.attempts ?? 0) + 1 }).eq("id", job.id)
      await insertSyncLog(supabase, job, "Started")
      const out = await processJob(supabase, job)
      await insertSyncLog(supabase, job, "Completed OK")
      await markOk(supabase, job.id)
      await logAssistantActivity(supabase, {
        userId: job.user_id,
        kind: "job_executed",
        command: `sync job executed: ${job.provider}`,
        result: { jobId: job.id, provider: job.provider, target_type: (job as any).target_type, target_id: (job as any).target_id, status: "ok" },
      })
      if (job.provider === "google" && out?.eventId) {
        await logAssistantActivity(supabase, {
          userId: job.user_id,
          kind: "google_event_created",
          command: "google calendar event created",
          result: { jobId: job.id, calendarEventId: out.eventId, target_type: (job as any).target_type, target_id: (job as any).target_id },
        })
      }
      ok += 1
      results.push({ id: job.id, provider: job.provider, target_type: (job as any).target_type, target_id: (job as any).target_id, status: "ok" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync failed"
      await insertSyncLog(supabase, job, `Error: ${msg}`)
      await markError(supabase, job.id, msg.slice(0, 600))
      failed += 1
      results.push({ id: job.id, provider: job.provider, target_type: (job as any).target_type, target_id: (job as any).target_id, status: "error", error: msg })
    }
  }

  return { processed, ok, failed, results }
}

