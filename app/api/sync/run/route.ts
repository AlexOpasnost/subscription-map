import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { pushToGoogleCalendar } from "@/lib/sync/providers/googleCalendar"
import { pushToNotion } from "@/lib/sync/providers/notion"
import type { IntegrationRow, Provider, SyncAction, SyncJobRow } from "@/lib/sync/types"
import { getUserIdFromAccessToken } from "@/lib/supabase/userFromBearer"

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function shouldAuthorizeCron(req: NextRequest): boolean {
  const secret = process.env.SYNC_RUN_SECRET?.trim()
  if (!secret) return false
  const token = getBearerToken(req)
  return token === secret
}

async function insertLog(supabase: ReturnType<typeof getSupabaseAdmin>, job: { id: string; user_id: string }, message: string) {
  await supabase.from("sync_logs").insert({ sync_job_id: job.id, user_id: job.user_id, message })
}

function parseProvider(v: unknown): Provider | null {
  return v === "google" || v === "notion" ? v : null
}

function parseAction(v: unknown): SyncAction | null {
  return v === "upsert" || v === "delete" ? v : null
}

async function processJob(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  job: SyncJobRow
): Promise<void> {
  const provider = parseProvider(job.provider)
  const action = parseAction(job.action)
  const targetType = typeof (job as any).target_type === "string" ? String((job as any).target_type) : ""
  const targetId = typeof (job as any).target_id === "string" ? String((job as any).target_id) : ""
  if (!provider || !action || !targetType || !targetId) {
    throw new Error("Invalid job payload")
  }

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id,user_id,provider,access_token,refresh_token,expires_at,scope,meta,metadata,created_at")
    .eq("user_id", job.user_id)
    .eq("provider", provider)
    .maybeSingle()

  if (integrationError) throw integrationError
  if (!integration) throw new Error(`Integration not connected: ${provider}`)

  const log = async (message: string) => {
    await insertLog(supabase, job, message)
  }

  await log(`Running ${provider}:${action} for ${targetType}:${targetId}`)

  if (provider === "google") {
    await pushToGoogleCalendar(supabase, integration as IntegrationRow, { action, targetType, targetId, log })
    return
  }

  if (provider === "notion") {
    await pushToNotion(supabase, integration as IntegrationRow, { action, targetType, targetId, log })
    return
  }

  const neverProvider: never = provider
  throw new Error(`Unsupported provider: ${neverProvider}`)
}

async function claimJob(supabase: ReturnType<typeof getSupabaseAdmin>, jobId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("sync_jobs")
    // Keep spec column `status` as pending; use legacy_status as an internal lock.
    .update({ legacy_status: "running", last_error: null })
    .eq("id", jobId)
    .eq("status", "pending")
    .or("legacy_status.is.null,legacy_status.eq.queued")
    .select("id")
    .maybeSingle()

  if (error) throw error
  return !!data
}

async function markOk(supabase: ReturnType<typeof getSupabaseAdmin>, jobId: string) {
  const { error } = await supabase.from("sync_jobs").update({ status: "ok", legacy_status: "ok", last_error: null }).eq("id", jobId)
  if (error) throw error
}

async function markError(supabase: ReturnType<typeof getSupabaseAdmin>, jobId: string, message: string) {
  const { error } = await supabase.from("sync_jobs").update({ status: "error", legacy_status: "error", last_error: message }).eq("id", jobId)
  if (error) throw error
}

export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_RUN_SECRET?.trim()
  const token = getBearerToken(req)
  const cron = !!secret && shouldAuthorizeCron(req)
  if (!cron && !token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = getSupabaseAdmin()

  let onlyUserId: string | null = null
  if (!cron) {
    try {
      onlyUserId = await getUserIdFromAccessToken(token!)
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const baseSelect =
    "id,user_id,provider,target_type,target_id,action,status,attempts,last_error,legacy_status,legacy_action,legacy_payload,created_at,updated_at"

  const { data: jobs, error } = onlyUserId
    ? await supabase
        .from("sync_jobs")
        .select(baseSelect)
        .eq("user_id", onlyUserId)
        .eq("status", "pending")
        .lt("attempts", 10)
        .or("legacy_status.is.null,legacy_status.eq.queued")
        .order("created_at", { ascending: true })
        .limit(10)
    : await supabase
        .from("sync_jobs")
        .select(baseSelect)
        .eq("status", "pending")
        .lt("attempts", 10)
        .or("legacy_status.is.null,legacy_status.eq.queued")
        .order("created_at", { ascending: true })
        .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const queued = (jobs ?? []) as SyncJobRow[]
  let processed = 0
  let ok = 0
  let failed = 0
  const results: Array<{
    id: string
    provider?: string
    target_type?: string
    target_id?: string
    status: "skipped" | "ok" | "error"
    error?: string
  }> = []

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
      await insertLog(supabase, job, "Started")
      await processJob(supabase, job)
      await insertLog(supabase, job, "Completed OK")
      await markOk(supabase, job.id)
      ok += 1
      results.push({ id: job.id, provider: job.provider, target_type: (job as any).target_type, target_id: (job as any).target_id, status: "ok" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync failed"
      await insertLog(supabase, job, `Error: ${msg}`)
      await markError(supabase, job.id, msg)
      failed += 1
      results.push({ id: job.id, provider: job.provider, target_type: (job as any).target_type, target_id: (job as any).target_id, status: "error", error: msg })
    }
  }

  return NextResponse.json({
    processed,
    ok,
    failed,
    remaining_hint: Math.max(0, queued.length - processed),
    results,
  })
}

