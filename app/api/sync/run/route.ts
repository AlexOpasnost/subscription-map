import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { supabaseServer } from "@/lib/supabase/server"
import { pushToGoogleCalendar } from "@/lib/sync/providers/googleCalendar"
import { pushToNotion } from "@/lib/sync/providers/notion"
import type { IntegrationRow, Provider, SyncAction, SyncJobRow } from "@/lib/sync/types"
import { requireServerEnv } from "@/lib/env"
import { getUserIdFromAccessToken } from "@/lib/supabase/userFromBearer"
import { drainSyncJobs } from "@/lib/sync/drainSyncJobs"

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

type OAuthTokenRow = {
  id: string
  user_id: string
  provider: "google"
  access_token: string
  refresh_token: string | null
  expires_at: string | null
}

async function getGoogleAccessTokenForUser(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("oauth_tokens")
    .select("id,user_id,provider,access_token,refresh_token,expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Missing Google tokens (oauth_tokens)")

  const row = data as OAuthTokenRow
  const expiresAtMs = row.expires_at ? new Date(row.expires_at).getTime() : NaN
  const needsRefresh = !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() < 60_000
  if (!needsRefresh) return row.access_token

  const refreshToken = row.refresh_token?.trim() ?? ""
  if (!refreshToken) throw new Error("Missing refresh token")

  const clientId = requireServerEnv("GOOGLE_CLIENT_ID")
  const clientSecret = requireServerEnv("GOOGLE_CLIENT_SECRET")
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`Google token refresh failed (HTTP ${res.status})`)
  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  } catch {
    throw new Error("Google token refresh returned invalid JSON")
  }
  if (!isRecord(json)) throw new Error("Google token refresh returned invalid JSON")
  const accessToken = typeof json.access_token === "string" ? json.access_token : ""
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 0
  if (!accessToken || !expiresIn) throw new Error("Google token refresh returned missing fields")

  const expiresAtIso = new Date(Date.now() + expiresIn * 1000).toISOString()
  const { error: updErr } = await supabase.from("oauth_tokens").update({ access_token: accessToken, expires_at: expiresAtIso }).eq("id", row.id)
  if (updErr) console.error("[sync/run] failed updating oauth_tokens after refresh", updErr)
  return accessToken
}

async function ensureSubscriptionMapCalendar(accessToken: string): Promise<{ calendarId: string; created: boolean }> {
  const request = async (path: string, init: RequestInit & { method: "GET" | "POST" }): Promise<{ status: number; text: string }> => {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    })
    return { status: res.status, text: await res.text() }
  }

  // 1) Find existing calendar via calendarList.
  {
    const { status, text } = await request("/users/me/calendarList?maxResults=250", { method: "GET" })
    if (status >= 200 && status < 300) {
      try {
        const json = JSON.parse(text) as unknown
        if (isRecord(json) && Array.isArray(json.items)) {
          for (const item of json.items) {
            if (!isRecord(item)) continue
            const summary = typeof item.summary === "string" ? item.summary : ""
            const id = typeof item.id === "string" ? item.id : ""
            if (summary.trim() === "Subscription Map" && id.trim()) return { calendarId: id, created: false }
          }
        }
      } catch {
        // ignore; we'll try create below
      }
    } else {
      throw new Error(`Google calendarList failed (HTTP ${status})`)
    }
  }

  // 2) Create a new calendar.
  {
    const { status, text } = await request("/calendars", {
      method: "POST",
      body: JSON.stringify({ summary: "Subscription Map", timeZone: "UTC" }),
    })
    if (status < 200 || status >= 300) {
      throw new Error(`Google calendars.insert failed (HTTP ${status})`)
    }
    let json: unknown
    try {
      json = JSON.parse(text) as unknown
    } catch {
      throw new Error("Google calendars.insert returned invalid JSON")
    }
    if (!isRecord(json)) throw new Error("Google calendars.insert returned invalid JSON")
    const id = typeof json.id === "string" ? json.id : ""
    if (!id.trim()) throw new Error("Google calendars.insert returned no calendar id")
    return { calendarId: id, created: true }
  }
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

async function logAssistantActivity(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: { userId: string; kind: string; command: string; result: Record<string, unknown> }
) {
  const { error } = await supabase.from("assistant_activity").insert({
    user_id: input.userId,
    kind: input.kind,
    command: input.command,
    result: input.result,
    input_text: input.command,
    intent: {},
    status: "ok",
    error: null,
  })
  if (error) console.error("[sync/run] assistant_activity insert error", error)
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
  const supabase = getSupabaseAdmin()
  const mode = req.nextUrl.searchParams.get("mode")?.trim() ?? ""

  /**
   * Verification (prod):
   * A) While logged in, call `POST /api/sync/run?mode=drain` and expect processed>0.
   * B) SQL: check sync_jobs move pending -> ok/error and sync_logs is non-empty.
   * C) Tasks with due_date should get google_event_id set after ok jobs.
   */

  // Drain mode (cookie-auth): drain queued jobs for the current user.
  if (mode === "drain") {
    const authSb = await supabaseServer()
    const {
      data: { user },
    } = await authSb.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { processed: 0, ok: 0, failed: 0, results: [], error: "Not authenticated" },
        { status: 401 }
      )
    }

    try {
      const out = await drainSyncJobs(supabase, { onlyUserId: user.id, limit: 10 })
      return NextResponse.json(out)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync drain failed"
      console.error("[sync/run] drain failed", { userId: user.id, error: msg })
      // Always return a summary object so callers can render status.
      return NextResponse.json({ processed: 0, ok: 0, failed: 0, results: [], error: msg }, { status: 200 })
    }
  }

  // Manual (UI) sync: cookie-authenticated user on Vercel.
  try {
    const authSb = await supabaseServer()
    const {
      data: { user },
    } = await authSb.auth.getUser()
    if (user) {
      const userId = user.id
      console.log("[sync/run] manual sync requested", { userId })

      // Pick a task to sync (deterministic: most recent open task with due_at OR due_date).
      const { data: task, error: taskErr } = await supabase
        .from("tasks")
        .select("id,title,due_at,due_date,meta,status,created_at")
        .eq("user_id", userId)
        .eq("status", "open")
        .or("due_at.not.is.null,due_date.not.is.null")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 })
      if (!task) return NextResponse.json({ error: "No tasks with a due date/time to sync." }, { status: 400 })

      // Verify Google integration exists (connected).
      const { data: integration, error: intErr } = await supabase
        .from("integrations")
        .select("id,user_id,provider,status,meta,metadata,created_at,access_token,refresh_token,expires_at,scope")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle()
      if (intErr) return NextResponse.json({ error: intErr.message }, { status: 500 })
      if (!integration) return NextResponse.json({ error: "Google integration not connected." }, { status: 400 })
      const status = typeof (integration as any).status === "string" ? String((integration as any).status).toLowerCase() : ""
      if (status === "disconnected") {
        return NextResponse.json({ error: "Google integration is disconnected." }, { status: 400 })
      }

      // Create a sync job row (queued/pending) + log start.
      const { data: jobRow, error: jobErr } = await supabase
        .from("sync_jobs")
        .insert({
          user_id: userId,
          provider: "google",
          target_type: "task",
          target_id: (task as any).id,
          action: "upsert",
          status: "pending",
          attempts: 0,
          last_error: null,
          legacy_action: "push_task",
          legacy_payload: { record_id: (task as any).id },
          legacy_status: "queued",
        })
        .select("id")
        .single()
      if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
      const jobId = String((jobRow as any).id ?? "")

      await insertLog(supabase, { id: jobId, user_id: userId }, "Manual sync started")
      await logAssistantActivity(supabase, {
        userId,
        kind: "job_created",
        command: "sync job created: google",
        result: { jobId, provider: "google", target_type: "task", target_id: (task as any).id },
      })

      // Ensure calendar exists (requires https://www.googleapis.com/auth/calendar scope).
      const accessToken = await getGoogleAccessTokenForUser(supabase, userId)
      const cal = await ensureSubscriptionMapCalendar(accessToken)
      await insertLog(supabase, { id: jobId, user_id: userId }, `Calendar ensured: ${cal.calendarId} (created=${cal.created})`)

      // Persist calendar_id on integration metadata for future jobs.
      const mergeMeta = (prev: unknown, next: Record<string, unknown>): Record<string, unknown> => ({
        ...(isRecord(prev) ? prev : {}),
        ...next,
      })
      const nextMeta = mergeMeta((integration as any).meta, { calendar_id: cal.calendarId })
      const nextMetadata = mergeMeta((integration as any).metadata ?? (integration as any).meta, { calendar_id: cal.calendarId })
      const { error: updIntErr } = await supabase
        .from("integrations")
        .update({ meta: nextMeta, metadata: nextMetadata })
        .eq("id", (integration as any).id)
      if (updIntErr) {
        await insertLog(supabase, { id: jobId, user_id: userId }, `Warning: failed saving calendar_id on integration: ${updIntErr.message}`)
      }

      // Execute sync immediately (same endpoint).
      try {
        await supabase.from("sync_jobs").update({ legacy_status: "running", last_error: null }).eq("id", jobId)
        const integrationForPush = {
          ...(integration as unknown as IntegrationRow),
          meta: nextMeta,
          metadata: nextMetadata,
        }
        const out = await pushToGoogleCalendar(supabase, integrationForPush, {
          action: "upsert",
          targetType: "task",
          targetId: (task as any).id,
          log: async (message: string) => {
            await insertLog(supabase, { id: jobId, user_id: userId }, message)
          },
        })
        await insertLog(supabase, { id: jobId, user_id: userId }, `Google API result: calendarId=${cal.calendarId} eventId=${out?.eventId ?? ""}`)
        await markOk(supabase, jobId)
        await logAssistantActivity(supabase, {
          userId,
          kind: "job_executed",
          command: "sync job executed: google",
          result: { jobId, provider: "google", status: "ok" },
        })
        if (out?.eventId) {
          await logAssistantActivity(supabase, {
            userId,
            kind: "google_event_created",
            command: "google calendar event created",
            result: { jobId, calendarId: cal.calendarId, calendarEventId: out.eventId, target_type: "task", target_id: (task as any).id },
          })
        }
        await insertLog(supabase, { id: jobId, user_id: userId }, "Manual sync finished OK")
        return NextResponse.json({
          processed: 1,
          ok: 1,
          failed: 0,
          manual: true,
          job: { id: jobId, provider: "google", status: "done" },
          calendar: { id: cal.calendarId, created: cal.created },
          event: { id: out?.eventId ?? null },
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Sync failed"
        await insertLog(supabase, { id: jobId, user_id: userId }, `Error: ${msg}`)
        await markError(supabase, jobId, msg)
        await logAssistantActivity(supabase, {
          userId,
          kind: "job_executed",
          command: "sync job executed: google",
          result: { jobId, provider: "google", status: "failed", error: msg },
        })
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }
  } catch (err: unknown) {
    console.error("[sync/run] manual sync auth error", err)
  }

  // Background/cron processing (kept for production).
  const secret = process.env.SYNC_RUN_SECRET?.trim()
  const token = getBearerToken(req)
  const cron = !!secret && shouldAuthorizeCron(req)
  if (!cron && !token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let onlyUserId: string | null = null
  if (!cron) {
    try {
      onlyUserId = await getUserIdFromAccessToken(token!)
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const out = await drainSyncJobs(supabase, { onlyUserId, limit: 20 })
    return NextResponse.json(out)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Sync failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

