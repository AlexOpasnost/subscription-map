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
      channel: "inapp",
      title: "Test notification",
      status: "pending",
      run_at: runAt,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as any)?.id })
}

