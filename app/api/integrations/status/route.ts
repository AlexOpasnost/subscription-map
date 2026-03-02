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

  const { data: integrations, error: integrationsError } = await supabase
    .from("integrations")
    .select("provider,meta,metadata,created_at,expires_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (integrationsError) return NextResponse.json({ ok: false, error: integrationsError.message }, { status: 500 })

  const providerMeta: Record<string, unknown> = {}

  for (const row of integrations ?? []) {
    const provider = isRecord(row) && typeof row.provider === "string" ? row.provider : ""
    if (provider !== "notion") continue
    const meta = isRecord(row) ? (row.metadata ?? row.meta ?? {}) : {}
    providerMeta[provider] = meta
  }

  const notionConnected = isRecord(providerMeta.notion)

  return NextResponse.json({
    ok: true,
    integrations: integrations ?? [],
    connected: {
      notion: notionConnected,
    },
    notion: {
      databaseId:
        isRecord(providerMeta.notion) && typeof providerMeta.notion["notion_database_id"] === "string"
          ? providerMeta.notion["notion_database_id"]
          : "",
    },
  })
}

