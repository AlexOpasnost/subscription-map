import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/env"

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export async function GET(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const supabase = createClient(requireSupabaseUrl(), requireSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  // Prefer the new schema columns; fall back gracefully if the migration hasn't been applied yet.
  let data: any = null
  let error: any = null
  ;({ data, error } = await supabase
    .from("integrations")
    .select("status,scopes,scope,metadata,meta,expires_at,created_at")
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle())

  if (error) {
    const msg = typeof error?.message === "string" ? error.message : ""
    if (msg.toLowerCase().includes("column") && (msg.toLowerCase().includes("status") || msg.toLowerCase().includes("scopes"))) {
      ;({ data, error } = await supabase
        .from("integrations")
        .select("scope,metadata,meta,expires_at,created_at")
        .eq("provider", "google")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle())
    }
  }

  if (error) return NextResponse.json({ ok: false, error: (error as any)?.message ?? "Failed to load status" }, { status: 500 })

  const status = typeof (data as any)?.status === "string" ? String((data as any).status) : ""
  const scopesArr = Array.isArray((data as any)?.scopes) ? ((data as any).scopes as unknown[]).map(String) : null
  const scopeStr = typeof (data as any)?.scope === "string" ? String((data as any).scope) : ""
  const mergedMeta = (data as any)?.metadata ?? (data as any)?.meta ?? {}
  const scopesFromMeta =
    isRecord(mergedMeta) && Array.isArray((mergedMeta as any).scopes)
      ? ((mergedMeta as any).scopes as unknown[]).map(String)
      : null

  const scopes = (scopesArr && scopesArr.length ? scopesArr : scopesFromMeta && scopesFromMeta.length ? scopesFromMeta : scopeStr ? scopeStr.split(/\s+/) : []).filter(Boolean)

  const connected = Boolean(data) && (status ? status !== "disconnected" : true)
  return NextResponse.json({
    ok: true,
    connected,
    status: status || (connected ? "connected" : "disconnected"),
    scopes,
    expires_at: (data as any)?.expires_at ?? null,
  })
}

