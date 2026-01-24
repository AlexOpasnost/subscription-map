import { NextResponse, type NextRequest } from "next/server"

import { getAppOriginServer, requireServerEnv } from "@/lib/env"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

function parseState(state: string): { userId: string } {
  const idx = state.indexOf(":")
  const userId = idx > 0 ? state.slice(0, idx).trim() : ""
  if (!userId) throw new Error("Invalid state")
  return { userId }
}

function base64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64")
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export async function GET(req: NextRequest) {
  const origin = getAppOriginServer() ?? req.nextUrl.origin
  const redirectTo = new URL("/settings/integrations", origin)
  const redirectUri = `${origin}/api/oauth/notion/callback`

  try {
    const url = new URL(req.url)
    const error = url.searchParams.get("error")
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")

    if (error) {
      redirectTo.searchParams.set("error", `notion:${error}`)
      return NextResponse.redirect(redirectTo)
    }
    if (!code || !state) {
      redirectTo.searchParams.set("error", "notion:missing_code_or_state")
      return NextResponse.redirect(redirectTo)
    }

    const { userId } = parseState(state)

    const clientId = requireServerEnv("NOTION_CLIENT_ID")
    const clientSecret = requireServerEnv("NOTION_CLIENT_SECRET")

    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${base64(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      const details = await tokenRes.text()
      redirectTo.searchParams.set("error", "notion:token_exchange_failed")
      redirectTo.searchParams.set("details", details.slice(0, 600))
      return NextResponse.redirect(redirectTo)
    }

    const tokenJson = (await tokenRes.json()) as unknown
    if (!isRecord(tokenJson)) throw new Error("Invalid token response")

    const accessToken = typeof tokenJson.access_token === "string" ? tokenJson.access_token : ""
    if (!accessToken) throw new Error("Missing access token")

    const supabase = getSupabaseAdmin()

    const { error: upsertTokenError } = await supabase
      .from("oauth_tokens")
      .upsert(
        {
          user_id: userId,
          provider: "notion",
          access_token: accessToken,
          refresh_token: null,
          expires_at: null,
          scope: null,
        },
        { onConflict: "user_id,provider" }
      )

    if (upsertTokenError) throw upsertTokenError

    // Backwards-compat: also upsert into integrations table if present
    await supabase.from("integrations").upsert(
      {
        user_id: userId,
        provider: "notion",
        access_token: accessToken,
        refresh_token: null,
        expires_at: null,
        meta: {},
      },
      { onConflict: "user_id,provider" }
    )

    redirectTo.searchParams.set("connected", "notion")
    return NextResponse.redirect(redirectTo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    redirectTo.searchParams.set("error", "notion:unexpected")
    redirectTo.searchParams.set("details", message.slice(0, 600))
    return NextResponse.redirect(redirectTo)
  }
}

