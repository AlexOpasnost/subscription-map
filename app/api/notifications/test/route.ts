import { NextResponse } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

function ts(): string {
  return new Date().toISOString()
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/notifications/test", method: "GET", ts: ts() })
}

export async function POST(_req: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const admin = getSupabaseAdmin()
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from("notifications")
    .insert({
      user_id: user.id,
      channel: "in_app",
      status: "pending",
      run_at: nowIso,
      title: "Test notification",
      body: "Hello from test",
      attempts: 0,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, insertedId: (data as any)?.id ?? null, userId: user.id })
}

