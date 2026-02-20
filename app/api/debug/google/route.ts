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

  if (!user) {
    return NextResponse.json({ connected: false, hasRefreshToken: false, scope: null, expiresAt: null }, { status: 401 })
  }

  const { data: tokenRow, error } = await supabase
    .from("oauth_tokens")
    .select("provider,access_token,refresh_token,expires_at,scope,updated_at")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { connected: false, hasRefreshToken: false, scope: null, expiresAt: null, error: error.message },
      { status: 500 }
    )
  }

  const access = isRecord(tokenRow) && typeof tokenRow.access_token === "string" ? tokenRow.access_token : ""
  const refresh = isRecord(tokenRow) && typeof tokenRow.refresh_token === "string" ? tokenRow.refresh_token : ""
  const scope = isRecord(tokenRow) && typeof tokenRow.scope === "string" ? tokenRow.scope : null
  const expiresAt = isRecord(tokenRow) && typeof tokenRow.expires_at === "string" ? tokenRow.expires_at : null
  const updatedAt = isRecord(tokenRow) && typeof tokenRow.updated_at === "string" ? tokenRow.updated_at : null

  return NextResponse.json({
    connected: Boolean(access && access.trim()),
    hasRefreshToken: Boolean(refresh && refresh.trim()),
    scope,
    expiresAt,
    updatedAt,
  })
}

