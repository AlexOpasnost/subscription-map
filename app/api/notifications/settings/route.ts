import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

function asInt(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback
}

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("user_notification_settings")
    .select("user_id,inapp_enabled,email_enabled,email_address,default_lead_minutes")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const row = (data ?? {}) as any
  return NextResponse.json({
    ok: true,
    settings: {
      inapp_enabled: asBool(row.inapp_enabled, true),
      email_enabled: asBool(row.email_enabled, false),
      email_address: asString(row.email_address),
      default_lead_minutes: asInt(row.default_lead_minutes, 1440),
    },
  })
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const inapp_enabled = asBool((body as any)?.inapp_enabled, true)
  const email_enabled = asBool((body as any)?.email_enabled, false)
  const email_address = asString((body as any)?.email_address)
  const leadDays = asInt((body as any)?.lead_days, 1)
  const default_lead_minutes = Math.max(0, Math.min(60 * 24 * 30, leadDays * 1440))

  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from("user_notification_settings")
    .upsert(
      {
        user_id: user.id,
        inapp_enabled,
        email_enabled,
        email_address,
        default_lead_minutes,
      },
      { onConflict: "user_id" }
    )

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

