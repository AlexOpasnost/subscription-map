import { NextResponse } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

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

  const admin = getSupabaseAdmin()
  const nowIso = new Date().toISOString()

  const { data: rows, error } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(20)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const ids = (rows ?? [])
    .map((r: any) => (typeof r?.id === "string" ? r.id : ""))
    .filter((id: string) => id.length > 0)

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, ids: [] as string[] })
  }

  const { error: updErr } = await admin
    .from("notifications")
    .update({ status: "sent", sent_at: nowIso })
    .in("id", ids)
    .eq("user_id", user.id)

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, processed: ids.length, ids })
}

