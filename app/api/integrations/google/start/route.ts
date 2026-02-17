import { NextResponse, type NextRequest } from "next/server"
import crypto from "crypto"

import { signIntegrationState } from "@/lib/integrations/state"
import { requireAppUrlOrigin, requireServerEnv } from "@/lib/env"
import { getAppOriginFromRequest } from "@/lib/integrations/getAppOrigin"
import { supabaseServer } from "@/lib/supabase/server"

const STATE_COOKIE = "sm_google_oauth_nonce"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

type SupabaseServerClient = Awaited<ReturnType<typeof supabaseServer>>

async function shouldPromptForConsent(supabase: SupabaseServerClient, userId: string): Promise<boolean> {
  // Only force prompt=consent when we don't have a refresh token yet.
  // This reduces needless re-consent while still ensuring we capture refresh_token when needed.
  try {
    const { data, error } = await supabase
      .from("oauth_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle()
    if (error) return true
    const rt = isRecord(data) && typeof data.refresh_token === "string" ? data.refresh_token : ""
    return !rt.trim()
  } catch {
    return true
  }
}

function buildGoogleOauthUrl(input: { userId: string; redirectUri: string; clientId: string; nonce: string; prompt: boolean }) {
  const exp = Math.floor(Date.now() / 1000) + 10 * 60
  const state = signIntegrationState({ userId: input.userId, provider: "google", exp, nonce: input.nonce })
  // Use full Calendar scope so we can create calendars + events.
  const scope = ["https://www.googleapis.com/auth/calendar"].join(" ")

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.searchParams.set("client_id", input.clientId)
  url.searchParams.set("redirect_uri", input.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", scope)
  url.searchParams.set("access_type", "offline")
  // Force consent only when we need to (to reliably obtain refresh_token).
  if (input.prompt) url.searchParams.set("prompt", "consent")
  url.searchParams.set("include_granted_scopes", "true")
  url.searchParams.set("state", state)
  return url
}

export async function GET(req: NextRequest) {
  return start(req, { redirect: true })
}

export async function POST(req: NextRequest) {
  return start(req, { redirect: false })
}

async function start(req: NextRequest, opts: { redirect: boolean }) {
  const originForErrors = req.nextUrl.origin
  try {
    const supabase = await supabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Required env vars (server-only):
    // - GOOGLE_CLIENT_ID
    // - GOOGLE_CLIENT_SECRET (used in callback / token exchange)
    const appUrl = requireAppUrlOrigin() || getAppOriginFromRequest(req)
    const clientId = requireServerEnv("GOOGLE_CLIENT_ID")

    const redirectUri = `${appUrl}/api/integrations/google/callback`
    const nonce = crypto.randomUUID()
    const prompt = await shouldPromptForConsent(supabase, user.id)
    const url = buildGoogleOauthUrl({ userId: user.id, redirectUri, clientId, nonce, prompt })

    const res = opts.redirect ? NextResponse.redirect(url.toString()) : NextResponse.json({ url: url.toString() })
    res.cookies.set(STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/api/integrations/google/callback",
      maxAge: 10 * 60,
    })
    return res
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Couldn’t start Google OAuth."
    if (opts.redirect) {
      const redirectTo = new URL("/settings/integrations", originForErrors)
      redirectTo.searchParams.set("error", "google:config")
      redirectTo.searchParams.set("details", message.slice(0, 600))
      return NextResponse.redirect(redirectTo)
    }
    return NextResponse.json(
      {
        error: message,
        hint: "Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL (prod).",
      },
      { status: 500 }
    )
  }
}

