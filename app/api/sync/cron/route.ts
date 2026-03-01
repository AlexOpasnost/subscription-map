import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { drainSyncJobs } from "@/lib/sync/drainSyncJobs"

/**
 * Vercel Cron-compatible sync runner.
 *
 * Verification (prod):
 * - POST `/api/sync/cron?secret=...` should return processed/ok/failed/results.
 * - SQL: `public.sync_logs` should start receiving rows.
 */
export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  const secretParam = req.nextUrl.searchParams.get("secret")?.trim() ?? ""
  const expected = (process.env.SYNC_CRON_SECRET ?? process.env.SYNC_RUN_SECRET ?? "").trim()
  if (!expected) {
    return NextResponse.json({ error: "Missing SYNC_CRON_SECRET (or SYNC_RUN_SECRET)" }, { status: 500 })
  }
  if (!secretParam || secretParam !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Optional hardening: Vercel Cron sets `x-vercel-cron: 1`.
  const vercelCron = req.headers.get("x-vercel-cron")
  if (vercelCron !== null && vercelCron !== "1") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  try {
    const out = await drainSyncJobs(supabase, { onlyUserId: null, limit: 10 })
    return NextResponse.json(out)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Cron sync failed"
    console.error("[sync/cron] drain failed", { error: msg })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

