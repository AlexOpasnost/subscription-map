import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getUserIdFromAccessToken } from "@/lib/supabase/userFromBearer"

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

async function notionRequest(accessToken: string, path: string): Promise<unknown> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
  })
  if (!res.ok) {
    const details = await res.text()
    throw new Error(`Notion API error (${res.status}): ${details.slice(0, 800)}`)
  }
  return (await res.json()) as unknown
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

  const notionToken = typeof (body as any)?.token === "string" ? String((body as any).token).trim() : ""
  const databaseId = typeof (body as any)?.databaseId === "string" ? String((body as any).databaseId).trim() : ""

  if (!notionToken) return NextResponse.json({ ok: false, error: "Missing Notion token" }, { status: 400 })
  if (!databaseId) return NextResponse.json({ ok: false, error: "Missing Notion databaseId" }, { status: 400 })

  let userId: string
  try {
    userId = await getUserIdFromAccessToken(token)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Not authenticated"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  try {
    // Validate token + database access (server-side).
    await notionRequest(notionToken, `/databases/${databaseId}`)

    const supabase = getSupabaseAdmin()
    const { data: existing, error: existingError } = await supabase
      .from("integrations")
      .select("id,meta,metadata")
      .eq("user_id", userId)
      .eq("provider", "notion")
      .maybeSingle()

    if (existingError) throw existingError

    const nextMeta = mergeMeta(existing?.meta, {
      provider: "notion",
      notion_database_id: databaseId,
    })
    const nextMetadata = mergeMeta(existing?.metadata, {
      provider: "notion",
      notion_database_id: databaseId,
    })

    const { error: upsertError } = await supabase
      .from("integrations")
      .upsert(
        {
          user_id: userId,
          provider: "notion",
          access_token: notionToken,
          refresh_token: null,
          expires_at: null,
          scope: null,
          meta: nextMeta,
          metadata: nextMetadata,
        },
        { onConflict: "user_id,provider" }
      )

    if (upsertError) throw upsertError

    // Never return secrets to the client.
    return NextResponse.json({
      ok: true,
      provider: "notion",
      connected: true,
      metadata: { notion_database_id: databaseId },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Couldn’t save Notion settings"
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}

