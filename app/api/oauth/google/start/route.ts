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
  const redirectUri = `${origin}/api/oauth/google/callback`

  try {
    const clientId = requireServerEnv("GOOGLE_CLIENT_ID")
    const expState = `${userId}:${crypto.randomUUID()}`

    // Use full Calendar scope so we can create calendars + events.
    const scope = ["https://www.googleapis.com/auth/calendar"].join(" ")

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", scope)
    url.searchParams.set("access_type", "offline")
    url.searchParams.set("prompt", "consent")
    url.searchParams.set("include_granted_scopes", "true")
    url.searchParams.set("state", expState)

    return NextResponse.redirect(url.toString())
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    const fallback = new URL("/settings/integrations", origin)
    fallback.searchParams.set("error", "google:config")
    fallback.searchParams.set("details", message.slice(0, 600))
    return NextResponse.redirect(fallback)
  }
}

