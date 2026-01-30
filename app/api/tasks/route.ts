import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

type TaskRow = {
  id: string
  user_id: string
  title: string
  due_date: string | null
  status: string
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
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  return Number.isFinite(dt.getTime())
}

export async function POST(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })
  }

  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const title = typeof (body as any)?.title === "string" ? String((body as any).title).trim() : ""
  const dueDateRaw = (body as any)?.due_date
  const due_date =
    dueDateRaw === null || typeof dueDateRaw === "undefined"
      ? null
      : typeof dueDateRaw === "string"
        ? dueDateRaw.trim()
        : ""

  if (!title) {
    return NextResponse.json({ ok: false, error: "Missing title" }, { status: 400 })
  }
  if (title.length > 200) {
    return NextResponse.json({ ok: false, error: "Title is too long (max 200 characters)" }, { status: 400 })
  }
  if (due_date && !isIsoDateOnly(due_date)) {
    return NextResponse.json({ ok: false, error: "Invalid due_date. Use YYYY-MM-DD." }, { status: 400 })
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
  if (authError) {
    console.error("[tasks] auth.getUser error", authError)
    return NextResponse.json({ ok: false, error: authError.message }, { status: 401 })
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })
  }

  const { data: created, error: insertError } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title,
      due_date,
      status: "open",
    })
    .select("id,user_id,title,due_date,status,created_at")
    .single()

  if (insertError) {
    console.error("[tasks] insert error", insertError)
    return NextResponse.json({ ok: false, error: insertError.message, details: insertError }, { status: 500 })
  }

  return NextResponse.json({ ok: true, task: created as TaskRow })
}

