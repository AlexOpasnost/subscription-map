import { NextResponse, type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function mergeMeta(prev: unknown, next: Record<string, unknown>): Record<string, unknown> {
  return { ...(isRecord(prev) ? prev : {}), ...next }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const sync = isRecord(body) && isRecord(body.sync) ? body.sync : null
  if (!sync) {
    return NextResponse.json({ ok: false, error: "Missing sync settings" }, { status: 400 })
  }
  const nextSync = {
    tasks: typeof sync.tasks === "boolean" ? sync.tasks : true,
    subscriptions: typeof sync.subscriptions === "boolean" ? sync.subscriptions : true,
    birthdays: typeof sync.birthdays === "boolean" ? sync.birthdays : true,
  }

  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const { data: integrations, error: integrationsError } = await supabase
    .from("integrations")
    .select("id,provider,meta,metadata")
    .eq("user_id", user.id)

  if (integrationsError) return NextResponse.json({ ok: false, error: integrationsError.message }, { status: 500 })

  const rows = integrations ?? []
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, settings: nextSync })
  }

  for (const row of rows) {
    if (!isRecord(row)) continue
    const nextMeta = mergeMeta(row["meta"], { sync: nextSync })
    const nextMetadata = mergeMeta(row["metadata"] ?? row["meta"], { sync: nextSync })
    const id = typeof row["id"] === "string" ? row["id"] : ""
    if (!id) continue
    const { error } = await supabase.from("integrations").update({ meta: nextMeta, metadata: nextMetadata }).eq("id", id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: rows.length, settings: nextSync })
}

