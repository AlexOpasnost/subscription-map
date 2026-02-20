import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const planId = req.nextUrl.searchParams.get("planId")?.trim() ?? ""
  if (!planId) return NextResponse.json({ error: "Missing planId" }, { status: 400 })
  if (!isUuid(planId)) return NextResponse.json({ error: "Invalid planId" }, { status: 400 })

  // Plan snapshot (for quick visibility even if no jobs exist).
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("id,title,start_date,end_date,google_event_id,created_at")
    .eq("id", planId)
    .maybeSingle()
  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 })
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 })

  const { data: job, error: jobErr } = await supabase
    .from("sync_jobs")
    .select("id,provider,target_type,target_id,action,status,attempts,last_error,created_at,updated_at,legacy_status")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .eq("target_type", "plan")
    .eq("target_id", planId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (jobErr) {
    // Don’t fail the endpoint if schema differs; still return plan snapshot.
    return NextResponse.json({ plan, job: null, logs: [], note: "Could not query sync_jobs (schema mismatch?)", error: jobErr.message })
  }

  if (!job) {
    return NextResponse.json({ plan, job: null, logs: [], note: "No sync_jobs found for this plan." })
  }

  const { data: logs, error: logsErr } = await supabase
    .from("sync_logs")
    .select("id,message,created_at")
    .eq("user_id", user.id)
    .eq("sync_job_id", (job as any).id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (logsErr) {
    return NextResponse.json({ plan, job, logs: [], note: "Could not query sync_logs.", error: logsErr.message })
  }

  return NextResponse.json({ plan, job, logs: logs ?? [] })
}

