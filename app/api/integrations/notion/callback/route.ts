import { NextResponse, type NextRequest } from "next/server"

import { getAppOrigin } from "@/lib/integrations/getAppOrigin"
import { verifyIntegrationState } from "@/lib/integrations/state"
import { requireServerEnv } from "@/lib/env"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function mergeMeta(prev: unknown, next: Record<string, unknown>): Record<string, unknown> {
  return { ...(isRecord(prev) ? prev : {}), ...next }
}

function base64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64")
}

export async function GET(req: NextRequest) {
  const fallbackOrigin = req.nextUrl.origin
  const appOrigin = (() => {
    try {
      return getAppOrigin({ required: false })
    } catch {
      return fallbackOrigin
    }
  })()
  const redirectTo = new URL("/settings/integrations", appOrigin)

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

    const parsedState = verifyIntegrationState(state)
    if (parsedState.provider !== "notion") {
      redirectTo.searchParams.set("error", "notion:invalid_state_provider")
      return NextResponse.redirect(redirectTo)
    }

    const clientId = requireServerEnv("NOTION_CLIENT_ID")
    const clientSecret = requireServerEnv("NOTION_CLIENT_SECRET")
    const redirectUri = `${appOrigin}/api/integrations/notion/callback`

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
    if (!isRecord(tokenJson)) {
      redirectTo.searchParams.set("error", "notion:invalid_token_response")
      return NextResponse.redirect(redirectTo)
    }

    const accessToken = typeof tokenJson.access_token === "string" ? tokenJson.access_token : ""
    const workspaceId = typeof tokenJson.workspace_id === "string" ? tokenJson.workspace_id : undefined
    const workspaceName = typeof tokenJson.workspace_name === "string" ? tokenJson.workspace_name : undefined
    const botId = typeof tokenJson.bot_id === "string" ? tokenJson.bot_id : undefined

    if (!accessToken) {
      redirectTo.searchParams.set("error", "notion:missing_access_token")
      return NextResponse.redirect(redirectTo)
    }

    const supabase = getSupabaseAdmin()
    const { data: existing } = await supabase
      .from("integrations")
      .select("id,meta")
      .eq("user_id", parsedState.userId)
      .eq("provider", "notion")
      .maybeSingle()

    const nextMeta = mergeMeta(existing?.meta, {
      provider: "notion",
      workspace_id: workspaceId,
      workspace_name: workspaceName,
      bot_id: botId,
    })

    const { error: upsertError } = await supabase
      .from("integrations")
      .upsert(
        {
          user_id: parsedState.userId,
          provider: "notion",
          access_token: accessToken,
          refresh_token: null,
          expires_at: null,
          meta: nextMeta,
        },
        { onConflict: "user_id,provider" }
      )

    if (upsertError) {
      redirectTo.searchParams.set("error", "notion:store_failed")
      redirectTo.searchParams.set("details", upsertError.message)
      return NextResponse.redirect(redirectTo)
    }

    redirectTo.searchParams.set("connected", "notion")
    return NextResponse.redirect(redirectTo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    redirectTo.searchParams.set("error", "notion:unexpected")
    redirectTo.searchParams.set("details", message.slice(0, 600))
    return NextResponse.redirect(redirectTo)
  }
}

