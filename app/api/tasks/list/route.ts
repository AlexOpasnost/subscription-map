import { NextResponse, type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

type TaskRow = {
  id: string
  user_id: string
  title: string
  due_date: string | null
  status: string
  created_at: string
}

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer()

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

