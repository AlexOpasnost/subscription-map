import { NextResponse } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"

function ts(): string {
  return new Date().toISOString()
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/notifications/run", hint: "Use POST to execute runner", ts: ts() })
}

export async function POST(_req: Request) {
  // Initialize server-side Supabase client exactly like /api/debug/session.
  const supabase = await supabaseServer()

  // Verify tables exist / are queryable.
  const { error: nErr } = await supabase.from("notifications").select("id").limit(1)
  if (nErr) {
    return NextResponse.json({ ok: false, error: nErr.message, route: "/api/notifications/run" }, { status: 500 })
  }

  const { error: sErr } = await supabase.from("user_notification_settings").select("user_id").limit(1)
  if (sErr) {
    return NextResponse.json({ ok: false, error: sErr.message, route: "/api/notifications/run" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: "notifications runner reached", route: "/api/notifications/run", ts: ts() })
}

