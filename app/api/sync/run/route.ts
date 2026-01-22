import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { pushToGoogleCalendar } from "@/lib/sync/providers/googleCalendar"
import { pushToNotion } from "@/lib/sync/providers/notion"
import type { IntegrationRow, Provider, SyncAction, SyncJobRow } from "@/lib/sync/types"

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
  return v === "push_task" || v === "push_plan" || v === "push_subscription" ? v : null
}

function getRecordId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null
  const p = payload as Record<string, unknown>
  const id = p.record_id
  return typeof id === "string" && id.trim() ? id.trim() : null
}

async function processJob(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  job: SyncJobRow
): Promise<void> {
  const provider = parseProvider(job.provider)
  const action = parseAction(job.action)
  const recordId = getRecordId(job.payload)
  if (!provider || !action || !recordId) {
    throw new Error("Invalid job payload")
  }

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id,user_id,provider,access_token,refresh_token,expires_at,meta,created_at")
    .eq("user_id", job.user_id)
    .eq("provider", provider)
    .maybeSingle()

  if (integrationError) throw integrationError
  if (!integration) throw new Error(`Integration not connected: ${provider}`)

  const log = async (message: string) => {
    await insertLog(supabase, job, message)
  }

  await log(`Running ${provider}:${action} for record_id=${recordId}`)

  if (provider === "google") {
    await pushToGoogleCalendar(supabase, integration as IntegrationRow, { action, recordId, log })
    return
  }

  if (provider === "notion") {
    await pushToNotion(supabase, integration as IntegrationRow, { action, recordId, log })
    return
  }

  const neverProvider: never = provider
  throw new Error(`Unsupported provider: ${neverProvider}`)
}

async function claimJob(supabase: ReturnType<typeof getSupabaseAdmin>, jobId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("sync_jobs")
    .update({ status: "running", error: null })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle()

  if (error) throw error
  return !!data
}

async function markOk(supabase: ReturnType<typeof getSupabaseAdmin>, jobId: string) {
  const { error } = await supabase.from("sync_jobs").update({ status: "ok", error: null }).eq("id", jobId)
  if (error) throw error
}

async function markError(supabase: ReturnType<typeof getSupabaseAdmin>, jobId: string, message: string) {
  const { error } = await supabase.from("sync_jobs").update({ status: "error", error: message }).eq("id", jobId)
  if (error) throw error
}

export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_RUN_SECRET?.trim()
  if (secret && !shouldAuthorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data: jobs, error } = await supabase
    .from("sync_jobs")
    .select("id,user_id,provider,action,payload,status,error,created_at,updated_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const queued = (jobs ?? []) as SyncJobRow[]
  let processed = 0
  let ok = 0
  let failed = 0
  const results: Array<{ id: string; status: "skipped" | "ok" | "error"; error?: string }> = []

  for (const job of queued) {
    const claimed = await claimJob(supabase, job.id)
    if (!claimed) {
      results.push({ id: job.id, status: "skipped" })
      continue
    }
    processed += 1
    try {
      await insertLog(supabase, job, "Started")
      await processJob(supabase, job)
      await insertLog(supabase, job, "Completed OK")
      await markOk(supabase, job.id)
      ok += 1
      results.push({ id: job.id, status: "ok" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error"
      await insertLog(supabase, job, `Error: ${msg}`)
      await markError(supabase, job.id, msg)
      failed += 1
      results.push({ id: job.id, status: "error", error: msg })
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

