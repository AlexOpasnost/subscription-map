import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { enqueueSyncJobs } from "@/lib/sync/enqueueSyncJobs"

type PersonRow = {
  id: string
  user_id: string
  name: string
  birth_date: string | null
  notes: string | null
  created_at: string
}

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`)
  return v
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function isIsoDateOnly(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return false
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  return Number.isFinite(dt.getTime())
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

  const name = typeof (body as any)?.name === "string" ? String((body as any).name).trim() : ""
  const birthDateRaw = (body as any)?.birth_date
  const notes = typeof (body as any)?.notes === "string" ? String((body as any).notes).trim() : null
  const birth_date =
    birthDateRaw === null || typeof birthDateRaw === "undefined"
      ? null
      : typeof birthDateRaw === "string"
        ? birthDateRaw.trim()
        : ""

  if (!name) return NextResponse.json({ ok: false, error: "Missing name" }, { status: 400 })
  if (name.length > 120) return NextResponse.json({ ok: false, error: "Name is too long (max 120 characters)" }, { status: 400 })
  if (birth_date && !isIsoDateOnly(birth_date)) {
    return NextResponse.json({ ok: false, error: "Invalid birth_date. Use YYYY-MM-DD." }, { status: 400 })
  }

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseAnonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    if (authError) console.error("[people] auth.getUser error", authError)
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })
  }

  const { data: created, error } = await supabase
    .from("people")
    .insert({
      user_id: user.id,
      name,
      birth_date: birth_date || null,
      notes: notes && notes.length ? notes.slice(0, 1000) : null,
    })
    .select("id,user_id,name,birth_date,notes,created_at")
    .single()

  if (error) {
    console.error("[people] insert error", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const sync = await enqueueSyncJobs(supabase, { userId: user.id, action: "upsert", targetType: "person", targetId: created.id })
  return NextResponse.json({ ok: true, person: created as PersonRow, sync })
}

