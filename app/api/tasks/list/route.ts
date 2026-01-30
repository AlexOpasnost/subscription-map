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

export async function GET(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })
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

  const { data, error } = await supabase
    .from("tasks")
    .select("id,user_id,title,due_date,status,created_at")
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) {
    console.error("[tasks] list error", error)
    return NextResponse.json({ ok: false, error: error.message, details: error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, tasks: (data ?? []) as TaskRow[] })
}

