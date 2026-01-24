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
      redirectTo.searchParams.set("error", `google:${error}`)
      return NextResponse.redirect(redirectTo)
    }
    if (!code || !state) {
      redirectTo.searchParams.set("error", "google:missing_code_or_state")
      return NextResponse.redirect(redirectTo)
    }

    const parsedState = verifyIntegrationState(state)
    if (parsedState.provider !== "google") {
      redirectTo.searchParams.set("error", "google:invalid_state_provider")
      return NextResponse.redirect(redirectTo)
    }

    const clientId = requireServerEnv("GOOGLE_CLIENT_ID")
    const clientSecret = requireServerEnv("GOOGLE_CLIENT_SECRET")
    const redirectUri = `${appOrigin}/api/integrations/google/callback`

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    })

    if (!tokenRes.ok) {
      const details = await tokenRes.text()
      redirectTo.searchParams.set("error", "google:token_exchange_failed")
      redirectTo.searchParams.set("details", details.slice(0, 600))
      return NextResponse.redirect(redirectTo)
    }

    const tokenJson = (await tokenRes.json()) as unknown
    if (!isRecord(tokenJson)) {
      redirectTo.searchParams.set("error", "google:invalid_token_response")
      return NextResponse.redirect(redirectTo)
    }

    const accessToken = typeof tokenJson.access_token === "string" ? tokenJson.access_token : ""
    const expiresIn = typeof tokenJson.expires_in === "number" ? tokenJson.expires_in : 0
    const refreshToken = typeof tokenJson.refresh_token === "string" ? tokenJson.refresh_token : undefined
    const scope = typeof tokenJson.scope === "string" ? tokenJson.scope : undefined

    if (!accessToken || !expiresIn) {
      redirectTo.searchParams.set("error", "google:missing_access_token")
      return NextResponse.redirect(redirectTo)
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    const supabase = getSupabaseAdmin()

    const { data: existing } = await supabase
      .from("integrations")
      .select("id,refresh_token,meta")
      .eq("user_id", parsedState.userId)
      .eq("provider", "google")
      .maybeSingle()

    const nextMeta = mergeMeta(existing?.meta, {
      provider: "google",
      scopes: scope ? scope.split(/\s+/).filter(Boolean) : undefined,
      calendar_id: "primary",
    })

    const { error: upsertError } = await supabase
      .from("integrations")
      .upsert(
        {
          user_id: parsedState.userId,
          provider: "google",
          access_token: accessToken,
          refresh_token: refreshToken ?? existing?.refresh_token ?? null,
          expires_at: expiresAt,
          meta: nextMeta,
        },
        { onConflict: "user_id,provider" }
      )

    if (upsertError) {
      redirectTo.searchParams.set("error", "google:store_failed")
      redirectTo.searchParams.set("details", upsertError.message)
      return NextResponse.redirect(redirectTo)
    }

    redirectTo.searchParams.set("connected", "google")
    return NextResponse.redirect(redirectTo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    redirectTo.searchParams.set("error", "google:unexpected")
    redirectTo.searchParams.set("details", message.slice(0, 600))
    return NextResponse.redirect(redirectTo)
  }
}

