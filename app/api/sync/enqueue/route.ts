import { NextResponse, type NextRequest } from "next/server"

import { enqueueSyncJobs } from "@/lib/sync/enqueueSyncJobs"
import { supabaseServer } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
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

  const supabase = await supabaseServer()

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

