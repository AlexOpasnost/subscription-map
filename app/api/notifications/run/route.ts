import { NextResponse } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"

function ts(): string {
  return new Date().toISOString()
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/notifications/run", hint: "Use POST to execute runner", ts: ts() })
}

export async function POST(_req: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  return NextResponse.json({ ok: true, sent: 0 })
}

