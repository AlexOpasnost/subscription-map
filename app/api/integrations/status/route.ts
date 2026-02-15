import { NextResponse } from "next/server"

type Provider = "google" | "notion"
import { supabaseServer } from "@/lib/supabase/server"

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

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  // TEMP DEBUG LOGGING (remove after verification)
  console.log(`[integrations/status] user.id=${user.id}`)

  // Tokens source of truth (google): avoid "Connected" UI if oauth_tokens is empty.
  const { data: googleToken, error: googleTokenError } = await supabase
    .from("oauth_tokens")
    .select("id,refresh_token,expires_at")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle()
  if (googleTokenError) return NextResponse.json({ ok: false, error: googleTokenError.message }, { status: 500 })

  const { data: integrations, error: integrationsError } = await supabase
    .from("integrations")
    .select("provider,meta,metadata,created_at,expires_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (integrationsError) return NextResponse.json({ ok: false, error: integrationsError.message }, { status: 500 })

  // TEMP DEBUG LOGGING (remove after verification)
  console.log(`[integrations/status] integrations.rows=${(integrations ?? []).length}`)

  const connectedProviders = new Set<Provider>()
  const providerMeta: Record<string, unknown> = {}

  for (const row of integrations ?? []) {
    const provider = isRecord(row) && typeof row.provider === "string" ? row.provider : ""
    if (provider !== "google" && provider !== "notion") continue
    connectedProviders.add(provider)
    const meta = isRecord(row) ? (row.metadata ?? row.meta ?? {}) : {}
    providerMeta[provider] = meta
  }

  // Override Google connected based on oauth_tokens (single source of truth).
  if (!googleToken) connectedProviders.delete("google")

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
    const provider = isRecord(j) && typeof j.provider === "string" ? j.provider : ""
    if (!provider || lastByProvider[provider]) continue
    lastByProvider[provider] = {
      status: isRecord(j) && typeof j.status === "string" ? j.status : "",
      last_error: isRecord(j) && typeof j.last_error === "string" ? j.last_error : null,
      updated_at: isRecord(j) && typeof j.updated_at === "string" ? j.updated_at : "",
    }
  }

  return NextResponse.json({
    ok: true,
    integrations: integrations ?? [],
    connected: {
      google: connectedProviders.has("google"),
      notion: connectedProviders.has("notion"),
    },
    settings,
    notion: {
      databaseId:
        isRecord(providerMeta.notion) && typeof providerMeta.notion["notion_database_id"] === "string"
          ? providerMeta.notion["notion_database_id"]
          : "",
    },
    lastSync: {
      google: lastByProvider.google ?? null,
      notion: lastByProvider.notion ?? null,
    },
    google: {
      token: {
        hasRefreshToken: Boolean(isRecord(googleToken) && typeof googleToken["refresh_token"] === "string" && googleToken["refresh_token"].trim()),
        expires_at: isRecord(googleToken) && typeof googleToken["expires_at"] === "string" ? googleToken["expires_at"] : null,
      },
    },
  })
}

