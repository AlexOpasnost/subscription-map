import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

type Provider = "google" | "notion"

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`)
  return v
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function getSyncSettings(meta: unknown): { tasks: boolean; subscriptions: boolean; birthdays: boolean } {
  const m = isRecord(meta) ? meta : {}
  const sync = isRecord(m.sync) ? (m.sync as Record<string, unknown>) : {}
  const tasks = typeof sync.tasks === "boolean" ? sync.tasks : true
  const subscriptions = typeof sync.subscriptions === "boolean" ? sync.subscriptions : true
  const birthdays = typeof sync.birthdays === "boolean" ? sync.birthdays : true
  return { tasks, subscriptions, birthdays }
}

export async function GET(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

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
    .select("provider,meta,metadata,created_at,expires_at")
    .order("created_at", { ascending: false })

  if (integrationsError) return NextResponse.json({ ok: false, error: integrationsError.message }, { status: 500 })

  const connectedProviders = new Set<Provider>()
  const providerMeta: Record<string, unknown> = {}

  for (const row of integrations ?? []) {
    const provider = (row as any)?.provider
    if (provider !== "google" && provider !== "notion") continue
    connectedProviders.add(provider)
    const meta = (row as any)?.metadata ?? (row as any)?.meta ?? {}
    providerMeta[provider] = meta
  }

  // Determine sync settings from any integration row (prefer google -> notion -> defaults).
  const settings = (() => {
    const google = providerMeta.google
    const notion = providerMeta.notion
    return getSyncSettings(isRecord(google) ? google : isRecord(notion) ? notion : {})
  })()

  const { data: jobs, error: jobsError } = await supabase
    .from("sync_jobs")
    .select("provider,status,last_error,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100)

  if (jobsError) return NextResponse.json({ ok: false, error: jobsError.message }, { status: 500 })

  const lastByProvider: Record<string, { status: string; last_error: string | null; updated_at: string }> = {}
  for (const j of jobs ?? []) {
    const provider = (j as any)?.provider
    if (!provider || lastByProvider[provider]) continue
    lastByProvider[provider] = {
      status: String((j as any)?.status ?? ""),
      last_error: typeof (j as any)?.last_error === "string" ? (j as any).last_error : null,
      updated_at: String((j as any)?.updated_at ?? ""),
    }
  }

  return NextResponse.json({
    ok: true,
    connected: {
      google: connectedProviders.has("google"),
      notion: connectedProviders.has("notion"),
    },
    settings,
    notion: {
      databaseId: isRecord(providerMeta.notion) && typeof (providerMeta.notion as any).notion_database_id === "string" ? String((providerMeta.notion as any).notion_database_id) : "",
    },
    lastSync: {
      google: lastByProvider.google ?? null,
      notion: lastByProvider.notion ?? null,
    },
  })
}

