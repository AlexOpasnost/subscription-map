import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(_req: NextRequest) {
  const sb = await supabaseServer()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const admin = getSupabaseAdmin()
  const runAt = new Date(Date.now() + 60_000).toISOString()

  const { data, error } = await admin
    .from("notifications")
    .insert({
      user_id: user.id,
      channel: "in_app",
      type: "test",
      title: "Test notification",
      body: "If you see this, internal notifications work.",
      status: "pending",
      run_at: runAt,
      meta: { test: true },
    })
    .select("id,user_id,channel,type,title,body,status,run_at,attempts,created_at")
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notification: data })
}

