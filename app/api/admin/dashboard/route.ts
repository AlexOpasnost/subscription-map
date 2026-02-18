import { NextResponse, type NextRequest } from "next/server"

import { requireSupabaseServiceRoleKey } from "@/lib/env"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { supabaseServer } from "@/lib/supabase/server"

function parseAdminEmails(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )
}

export async function GET(req: NextRequest) {
  const adminEmails = parseAdminEmails((process.env.ADMIN_EMAILS ?? "").trim())
  if (adminEmails.size === 0) {
    return NextResponse.json(
      { ok: false, error: "Admin is not configured. Set ADMIN_EMAILS." },
      { status: 403 }
    )
  }

  // Authenticate the caller using cookie session.
  const supabase = await supabaseServer()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const email = (user.email ?? "").trim().toLowerCase()
  if (!email || !adminEmails.has(email)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  // Prefer service role for cross-user visibility. Degrade gracefully if missing.
  let hasServiceRole = false
  try {
    requireSupabaseServiceRoleKey()
    hasServiceRole = true
  } catch {
    hasServiceRole = false
  }

  if (!hasServiceRole) {
    return NextResponse.json({
      ok: true,
      degraded: true,
      note: "SUPABASE_SERVICE_ROLE_KEY is missing; showing limited data.",
      user: { id: user.id, email: user.email },
      metrics: null,
      logs: [],
      ai_usage: [],
      integrations: [],
    })
  }

  const admin = getSupabaseAdmin()

  // Metrics: distinct user_id counts from subscriptions + integrations.
  const [subsUsersRes, intUsersRes] = await Promise.all([
    admin.from("subscriptions").select("user_id").limit(10000),
    admin.from("integrations").select("user_id").limit(10000),
  ])
  const subsUsers = (subsUsersRes.data ?? []).map((r: any) => String(r.user_id)).filter(Boolean)
  const intUsers = (intUsersRes.data ?? []).map((r: any) => String(r.user_id)).filter(Boolean)
  const distinctUsers = new Set([...subsUsers, ...intUsers])

  const [logsRes, aiRes, integrationsRes] = await Promise.all([
    admin.from("app_logs").select("id,user_id,level,area,message,created_at").order("created_at", { ascending: false }).limit(50),
    admin.from("ai_usage").select("id,user_id,model,total_tokens,created_at,request_id").order("created_at", { ascending: false }).limit(50),
    admin
      .from("integrations")
      .select("id,user_id,provider,status,scopes,expires_at,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const logsMissing = typeof (logsRes.error as any)?.message === "string" && String((logsRes.error as any).message).includes("app_logs")
  const aiMissing = typeof (aiRes.error as any)?.message === "string" && String((aiRes.error as any).message).includes("ai_usage")

  // If migrations weren't applied yet, degrade gracefully instead of hard failing.
  const fatal = [integrationsRes.error].filter(Boolean).map((e: any) => e.message)
  if (fatal.length) return NextResponse.json({ ok: false, error: fatal[0] }, { status: 500 })

  return NextResponse.json({
    ok: true,
    degraded: Boolean(logsMissing || aiMissing),
    user: { id: user.id, email: user.email },
    metrics: {
      distinct_user_count: distinctUsers.size,
      subscriptions_user_count: new Set(subsUsers).size,
      integrations_user_count: new Set(intUsers).size,
    },
    logs: logsMissing ? [] : (logsRes.data ?? []),
    ai_usage: aiMissing ? [] : (aiRes.data ?? []),
    integrations: integrationsRes.data ?? [],
    request: {
      path: req.nextUrl.pathname,
      now: new Date().toISOString(),
    },
  })
}

