import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed. Use POST." }, { status: 405 })
}

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
      meta: { source: "test" },
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as any)?.id })
}

