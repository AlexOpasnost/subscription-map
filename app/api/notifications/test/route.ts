import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export async function POST(_req: NextRequest) {
  const sb = await supabaseServer()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const admin = getSupabaseAdmin()
  const runAt = new Date().toISOString()

  const { data, error } = await admin
    .from("notifications")
    .insert({
      user_id: user.id,
      channel: "in_app",
      title: "Test notification",
      body: "If you see this, internal notifications are working.",
      status: "pending",
      run_at: runAt,
      source_type: "manual",
      source_id: null,
    })
    .select("id,user_id,channel,title,body,run_at,status,attempts,last_error,sent_at,source_type,source_id,created_at,updated_at")
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notification: data })
}

