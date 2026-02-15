import { NextResponse, type NextRequest } from "next/server"

import { verifyIntegrationState } from "@/lib/integrations/state"
import { requireAppUrlOrigin, requireServerEnv } from "@/lib/env"
import { getAppOriginFromRequest } from "@/lib/integrations/getAppOrigin"
import { supabaseServer } from "@/lib/supabase/server"

const STATE_COOKIE = "sm_google_oauth_nonce"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function mergeMeta(prev: unknown, next: Record<string, unknown>): Record<string, unknown> {
  return { ...(isRecord(prev) ? prev : {}), ...next }
}

export async function GET(req: NextRequest) {
  // Required env vars (server-only):
  // - GOOGLE_CLIENT_ID
  // - GOOGLE_CLIENT_SECRET
  const appUrl = requireAppUrlOrigin() || getAppOriginFromRequest(req)

  const redirectTo = new URL("/settings/integrations", appUrl)

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

    const supabase = await supabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirectTo.searchParams.set("error", "google:not_authenticated")
      redirectTo.searchParams.set("details", "Sign in again and retry connecting Google.")
      return NextResponse.redirect(redirectTo)
    }
    if (user.id !== parsedState.userId) {
      redirectTo.searchParams.set("error", "google:user_mismatch")
      redirectTo.searchParams.set("details", "Signed-in user does not match OAuth state. Please retry connecting Google.")
      return NextResponse.redirect(redirectTo)
    }

    // CSRF: ensure the nonce we issued on /start matches this callback.
    const cookieNonce = req.cookies.get(STATE_COOKIE)?.value ?? ""
    if (!cookieNonce || cookieNonce !== parsedState.nonce) {
      redirectTo.searchParams.set("error", "google:invalid_state")
      redirectTo.searchParams.set("details", "State cookie mismatch. Please retry connecting Google.")
      const res = NextResponse.redirect(redirectTo)
      res.cookies.set(STATE_COOKIE, "", {
        httpOnly: true,
        secure: appUrl.startsWith("https://"),
        sameSite: "lax",
        path: "/api/integrations/google/callback",
        maxAge: 0,
      })
      return res
    }

    const clientId = requireServerEnv("GOOGLE_CLIENT_ID")
    const clientSecret = requireServerEnv("GOOGLE_CLIENT_SECRET")
    const redirectUri = `${appUrl}/api/integrations/google/callback`

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

    // TEMP DEBUG LOGGING (remove after verification)
    console.log(`[integrations/google/callback] user.id=${user.id} expires_at=${expiresAt} has_refresh_token=${Boolean(refreshToken)}`)

    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id,meta,metadata")
      .eq("user_id", parsedState.userId)
      .eq("provider", "google")
      .maybeSingle()

    const { data: existingToken } = await supabase
      .from("oauth_tokens")
      .select("id,refresh_token")
      .eq("user_id", parsedState.userId)
      .eq("provider", "google")
      .maybeSingle()

    const prevMeta = isRecord(existingIntegration) ? existingIntegration["meta"] : undefined
    const prevMetadata = isRecord(existingIntegration) ? existingIntegration["metadata"] : undefined

    const nextMeta = mergeMeta(prevMeta, {
      provider: "google",
      scopes: scope ? scope.split(/\s+/).filter(Boolean) : undefined,
      calendar_id: "primary",
    })
    const nextMetadata = mergeMeta(prevMetadata ?? prevMeta, {
      provider: "google",
      scopes: scope ? scope.split(/\s+/).filter(Boolean) : undefined,
      calendar_id: "primary",
    })
    const scopesArr = scope ? scope.split(/\s+/).filter(Boolean) : null

    // 1) oauth_tokens is the source of truth for Google tokens.
    // Only update refresh_token if Google returned it; otherwise keep existing DB value.
    if (existingToken && isRecord(existingToken) && typeof existingToken["id"] === "string") {
      const update: Record<string, unknown> = {
        access_token: accessToken,
        expires_at: expiresAt,
        scope: scope ?? null,
      }
      if (refreshToken) update.refresh_token = refreshToken

      const { error: tokenUpdateError } = await supabase.from("oauth_tokens").update(update).eq("id", existingToken["id"])
      if (tokenUpdateError) throw tokenUpdateError
    } else {
      const { error: tokenInsertError } = await supabase.from("oauth_tokens").insert({
        user_id: parsedState.userId,
        provider: "google",
        access_token: accessToken,
        refresh_token: refreshToken ?? null,
        expires_at: expiresAt,
        scope: scope ?? null,
      })
      if (tokenInsertError) throw tokenInsertError
    }

    const finalRefreshToken =
      refreshToken ??
      (isRecord(existingToken) && typeof existingToken["refresh_token"] === "string" ? existingToken["refresh_token"] : null)
    if (!finalRefreshToken) console.warn(`[integrations/google/callback] missing refresh_token after connect; user_id=${user.id}`)

    // 2) integrations tracks connection status + metadata only (no tokens).
    const integrationsUpsertBase = {
      user_id: parsedState.userId,
      provider: "google",
      status: "connected",
      expires_at: expiresAt,
      scopes: scopesArr,
      meta: nextMeta,
      metadata: nextMetadata,
      // Keep tokens OUT of integrations. access_token is NOT NULL in older schemas, so store empty string.
      access_token: "",
      refresh_token: null,
      scope: scope ?? null,
    }

    // Prefer new schema columns; fall back for older schemas.
    let integrationsError: { message?: string } | null = null
    {
      const res = await supabase.from("integrations").upsert(integrationsUpsertBase, { onConflict: "user_id,provider" })
      integrationsError = (res.error as { message?: string } | null) ?? null
    }
    if (integrationsError) {
      const msg = typeof integrationsError.message === "string" ? integrationsError.message : ""
      if (msg.toLowerCase().includes("column") && (msg.toLowerCase().includes("status") || msg.toLowerCase().includes("scopes"))) {
        const res = await supabase.from("integrations").upsert(
          {
            user_id: parsedState.userId,
            provider: "google",
            access_token: "",
            refresh_token: null,
            expires_at: expiresAt,
            scope: scope ?? null,
            meta: nextMeta,
            metadata: nextMetadata,
          },
          { onConflict: "user_id,provider" }
        )
        integrationsError = (res.error as { message?: string } | null) ?? null
      }
    }
    if (integrationsError) throw integrationsError

    redirectTo.searchParams.set("connected", "google")
    const res = NextResponse.redirect(redirectTo)
    // Clear nonce cookie after successful connect.
    res.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      secure: appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/api/integrations/google/callback",
      maxAge: 0,
    })
    return res
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    redirectTo.searchParams.set("error", "google:unexpected")
    redirectTo.searchParams.set("details", message.slice(0, 600))
    const res = NextResponse.redirect(redirectTo)
    res.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      secure: appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/api/integrations/google/callback",
      maxAge: 0,
    })
    return res
  }
}

