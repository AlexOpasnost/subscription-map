import { NextResponse } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const { data: token, error: tokenError } = await supabase
    .from("oauth_tokens")
    .select("id,expires_at,scope,refresh_token")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle()
  if (tokenError) return NextResponse.json({ ok: false, error: tokenError.message }, { status: 500 })

  const errorMessage = (e: unknown): string => {
    if (isRecord(e) && typeof e.message === "string") return e.message
    return "Failed to load status"
  }

  // Prefer the new schema columns; fall back gracefully if the migration hasn't been applied yet.
  let data: unknown = null
  let error: unknown = null
  {
    const res = await supabase
    .from("integrations")
    .select("status,scopes,scope,metadata,meta,expires_at,created_at")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    data = res.data
    error = res.error
  }

  if (error) {
    const msg = errorMessage(error)
    if (msg.toLowerCase().includes("column") && (msg.toLowerCase().includes("status") || msg.toLowerCase().includes("scopes"))) {
      const res = await supabase
        .from("integrations")
        .select("scope,metadata,meta,expires_at,created_at")
        .eq("user_id", user.id)
        .eq("provider", "google")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      data = res.data
      error = res.error
    }
  }

  if (error) return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 })

  const row = isRecord(data) ? data : {}
  const status = typeof row.status === "string" ? row.status : ""
  const scopesArr = Array.isArray(row.scopes) ? (row.scopes as unknown[]).map(String) : null
  const scopeStr = typeof row.scope === "string" ? row.scope : ""
  const mergedMeta = (row.metadata ?? row.meta ?? {}) as unknown
  const scopesFromMeta =
    isRecord(mergedMeta) && Array.isArray(mergedMeta.scopes)
      ? (mergedMeta.scopes as unknown[]).map(String)
      : null

  const scopes = (scopesArr && scopesArr.length ? scopesArr : scopesFromMeta && scopesFromMeta.length ? scopesFromMeta : scopeStr ? scopeStr.split(/\s+/) : []).filter(Boolean)

  const connected = Boolean(token) && Boolean(data) && (status ? status !== "disconnected" : true)

  // TEMP DEBUG LOGGING (remove after verification)
  console.log(`[integrations/google/status] user.id=${user.id} connected=${connected} expires_at=${String(row.expires_at ?? "")}`)

  return NextResponse.json({
    ok: true,
    connected,
    status: status || (connected ? "connected" : "disconnected"),
    scopes,
    expires_at:
      (isRecord(token) && typeof token["expires_at"] === "string" ? token["expires_at"] : null) ??
      (typeof row.expires_at === "string" ? row.expires_at : null),
  })
}

