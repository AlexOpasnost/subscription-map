import { NextResponse, type NextRequest } from "next/server"

import { getAppOrigin } from "@/lib/integrations/getAppOrigin"
import { signIntegrationState } from "@/lib/integrations/state"
import { getUserIdFromAccessToken } from "@/lib/supabase/userFromBearer"

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`)
  return v
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = await getUserIdFromAccessToken(token)
    const appOrigin = getAppOrigin()

    const redirectUri = `${appOrigin}/api/integrations/notion/callback`
    const clientId = getEnv("NOTION_CLIENT_ID")

    const exp = Math.floor(Date.now() / 1000) + 10 * 60
    const state = signIntegrationState({ userId, provider: "notion", exp })

    const url = new URL("https://api.notion.com/v1/oauth/authorize")
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("owner", "user")
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("state", state)

    return NextResponse.json({ url: url.toString() })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

