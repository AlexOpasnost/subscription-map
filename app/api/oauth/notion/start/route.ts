import { NextResponse, type NextRequest } from "next/server"
import crypto from "crypto"

import { getAppOriginServer, requireServerEnv } from "@/lib/env"

function getUserIdFromQuery(req: NextRequest): string | null {
  const u = new URL(req.url)
  const userId = u.searchParams.get("user_id")?.trim() ?? ""
  return userId ? userId : null
}

export async function GET(req: NextRequest) {
  const userId = getUserIdFromQuery(req)
  if (!userId) return NextResponse.json({ error: "Missing user_id" }, { status: 400 })

  const origin = getAppOriginServer() ?? req.nextUrl.origin
  const redirectUri = `${origin}/api/oauth/notion/callback`

  try {
    const clientId = requireServerEnv("NOTION_CLIENT_ID")
    const state = `${userId}:${crypto.randomUUID()}`

    const url = new URL("https://api.notion.com/v1/oauth/authorize")
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("owner", "user")
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("state", state)

    return NextResponse.redirect(url.toString())
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    const fallback = new URL("/settings/integrations", origin)
    fallback.searchParams.set("error", "notion:config")
    fallback.searchParams.set("details", message.slice(0, 600))
    return NextResponse.redirect(fallback)
  }
}

