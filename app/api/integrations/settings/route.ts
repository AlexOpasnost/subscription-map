import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function mergeMeta(prev: unknown, next: Record<string, unknown>): Record<string, unknown> {
  return { ...(isRecord(prev) ? prev : {}), ...next }
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

  const sync = isRecord((body as any)?.sync) ? ((body as any).sync as Record<string, unknown>) : null
  if (!sync) {
    return NextResponse.json({ ok: false, error: "Missing sync settings" }, { status: 400 })
  }
  const nextSync = {
    tasks: typeof sync.tasks === "boolean" ? sync.tasks : true,
    subscriptions: typeof sync.subscriptions === "boolean" ? sync.subscriptions : true,
    birthdays: typeof sync.birthdays === "boolean" ? sync.birthdays : true,
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
  if (authError || !user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const { data: integrations, error: integrationsError } = await supabase
    .from("integrations")
    .select("id,provider,meta,metadata")
    .eq("user_id", user.id)

  if (integrationsError) return NextResponse.json({ ok: false, error: integrationsError.message }, { status: 500 })

  const rows = integrations ?? []
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, settings: nextSync })
  }

  for (const row of rows as any[]) {
    const nextMeta = mergeMeta(row.meta, { sync: nextSync })
    const nextMetadata = mergeMeta(row.metadata ?? row.meta, { sync: nextSync })
    const { error } = await supabase.from("integrations").update({ meta: nextMeta, metadata: nextMetadata }).eq("id", row.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: rows.length, settings: nextSync })
}

