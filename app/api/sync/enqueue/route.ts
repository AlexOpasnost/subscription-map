import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { enqueueSyncJobs } from "@/lib/sync/enqueueSyncJobs"
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/env"

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
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

  const targetType = typeof (body as any)?.target_type === "string" ? String((body as any).target_type).trim() : ""
  const targetId = typeof (body as any)?.target_id === "string" ? String((body as any).target_id).trim() : ""
  const action = typeof (body as any)?.action === "string" ? String((body as any).action).trim() : "upsert"

  if (!targetType) return NextResponse.json({ ok: false, error: "Missing target_type" }, { status: 400 })
  if (!targetId) return NextResponse.json({ ok: false, error: "Missing target_id" }, { status: 400 })
  if (action !== "upsert" && action !== "delete") {
    return NextResponse.json({ ok: false, error: "Invalid action. Use upsert or delete." }, { status: 400 })
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
  if (authError || !user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const sync = await enqueueSyncJobs(supabase, {
    userId: user.id,
    action: action as "upsert" | "delete",
    targetType: targetType as any,
    targetId,
  })

  return NextResponse.json({ ok: true, sync })
}

