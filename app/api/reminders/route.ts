import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/env"

type ReminderRow = {
  id: string
  user_id: string
  title: string
  target_type: string
  target_id: string | null
  rule_type: string
  remind_at: string | null
  created_at: string
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function isIsoDateTime(s: string): boolean {
  const d = new Date(s)
  return Number.isFinite(d.getTime())
}

export async function POST(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const title = typeof (body as any)?.title === "string" ? String((body as any).title).trim() : ""
  const target_type = typeof (body as any)?.target_type === "string" ? String((body as any).target_type).trim() : ""
  const target_id =
    typeof (body as any)?.target_id === "string" && String((body as any).target_id).trim()
      ? String((body as any).target_id).trim()
      : null
  const rule_type = typeof (body as any)?.rule_type === "string" ? String((body as any).rule_type).trim() : ""
  const remindAtRaw = (body as any)?.remind_at
  const remind_at =
    remindAtRaw === null || typeof remindAtRaw === "undefined"
      ? null
      : typeof remindAtRaw === "string"
        ? String(remindAtRaw).trim()
        : ""
  const offset_days = typeof (body as any)?.offset_days === "number" ? Math.floor((body as any).offset_days) : null
  const anchor_field = typeof (body as any)?.anchor_field === "string" ? String((body as any).anchor_field).trim() : null
  const rrule = typeof (body as any)?.rrule === "string" ? String((body as any).rrule).trim() : null
  const channel = typeof (body as any)?.channel === "string" ? String((body as any).channel).trim() : "in_app"

  if (!title) return NextResponse.json({ ok: false, error: "Missing title" }, { status: 400 })
  if (!target_type) return NextResponse.json({ ok: false, error: "Missing target_type" }, { status: 400 })
  if (!rule_type) return NextResponse.json({ ok: false, error: "Missing rule_type" }, { status: 400 })

  const rule = rule_type.toLowerCase()
  if (rule !== "absolute" && rule !== "offset_before" && rule !== "recurring") {
    return NextResponse.json({ ok: false, error: "Invalid rule_type. Use absolute, offset_before, or recurring." }, { status: 400 })
  }

  if (rule === "absolute") {
    if (!remind_at) return NextResponse.json({ ok: false, error: "Missing remind_at for absolute reminder" }, { status: 400 })
    if (!isIsoDateTime(remind_at)) {
      return NextResponse.json({ ok: false, error: "Invalid remind_at (ISO timestamp expected)" }, { status: 400 })
    }
  } else if (rule === "offset_before") {
    if (!offset_days || offset_days <= 0) {
      return NextResponse.json({ ok: false, error: "Missing offset_days (>0) for offset_before reminder" }, { status: 400 })
    }
    if (!anchor_field || !anchor_field.trim()) {
      return NextResponse.json({ ok: false, error: "Missing anchor_field for offset_before reminder" }, { status: 400 })
    }
    if (!target_id) {
      return NextResponse.json(
        { ok: false, error: "Missing target_id for offset_before reminder (so the date can be computed)." },
        { status: 400 }
      )
    }
    if (remind_at && !isIsoDateTime(remind_at)) {
      return NextResponse.json({ ok: false, error: "Invalid remind_at (ISO timestamp expected)" }, { status: 400 })
    }
  } else if (rule === "recurring") {
    if (!rrule || !rrule.trim()) {
      return NextResponse.json({ ok: false, error: "Missing rrule for recurring reminder" }, { status: 400 })
    }
    if (remind_at && !isIsoDateTime(remind_at)) {
      return NextResponse.json({ ok: false, error: "Invalid remind_at (ISO timestamp expected)" }, { status: 400 })
    }
  }

  const supabaseUrl = requireSupabaseUrl()
  const supabaseAnonKey = requireSupabaseAnonKey()
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    if (authError) console.error("[reminders] auth.getUser error", authError)
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })
  }

  const { data: created, error } = await supabase
    .from("reminders")
    .insert({
      user_id: user.id,
      // legacy column (003)
      kind: "api",
      target_type,
      target_id,
      remind_at: remind_at || null,
      // v2 columns (007)
      title,
      rule_type: rule,
      offset_days,
      anchor_field,
      rrule,
      channel,
    })
    .select("id,user_id,title,target_type,target_id,rule_type,remind_at,created_at")
    .single()

  if (error) {
    console.error("[reminders] insert error", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, reminder: created as ReminderRow })
}

