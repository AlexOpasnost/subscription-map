import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(req: NextRequest) {
  const sb = await supabaseServer()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const status = req.nextUrl.searchParams.get("status")?.trim() ?? ""
  const allowed = new Set(["pending", "processing", "sent", "error"])
  const statusFilter = allowed.has(status) ? status : null

  const admin = getSupabaseAdmin()
  const q = admin
    .from("notifications")
    .select("id,channel,title,body,status,run_at,sent_at,attempts,last_error,source_type,source_id,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  const { data, error } = statusFilter ? await q.eq("status", statusFilter) : await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, notifications: data ?? [] })
}

