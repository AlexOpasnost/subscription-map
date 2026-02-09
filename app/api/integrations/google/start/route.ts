import { NextResponse, type NextRequest } from "next/server"
import crypto from "crypto"

import { signIntegrationState } from "@/lib/integrations/state"
import { normalizeAbsoluteUrl, requireServerEnv } from "@/lib/env"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getUserIdFromAccessToken } from "@/lib/supabase/userFromBearer"

const STATE_COOKIE = "sm_google_oauth_nonce"

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function getUserIdFromQuery(req: NextRequest): string | null {
  const u = new URL(req.url)
  const userId = u.searchParams.get("user_id")?.trim() ?? ""
  return userId ? userId : null
}

async function shouldPromptForConsent(userId: string): Promise<boolean> {
  // Only force prompt=consent when we don't have a refresh token yet.
  // This reduces needless re-consent while still ensuring we capture refresh_token when needed.
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("integrations")
      .select("refresh_token")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle()
    if (error) return true
    const rt = typeof (data as any)?.refresh_token === "string" ? String((data as any).refresh_token) : ""
    return !rt.trim()
  } catch {
    return true
  }
}

function buildGoogleOauthUrl(input: { userId: string; redirectUri: string; clientId: string; nonce: string; prompt: boolean }) {
  const exp = Math.floor(Date.now() / 1000) + 10 * 60
  const state = signIntegrationState({ userId: input.userId, provider: "google", exp, nonce: input.nonce })
  const scope = ["https://www.googleapis.com/auth/calendar.events"].join(" ")

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.searchParams.set("client_id", input.clientId)
  url.searchParams.set("redirect_uri", input.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", scope)
  url.searchParams.set("access_type", "offline")
  // Production-grade: always prompt=consent to maximize refresh_token reliability.
  url.searchParams.set("prompt", "consent")
  url.searchParams.set("include_granted_scopes", "true")
  url.searchParams.set("state", state)
  return url
}

export async function GET(req: NextRequest) {
  // This GET handler is kept for compatibility with "navigate-to-start" flows.
  // For production-grade security, prefer calling POST with Authorization so we can derive userId from auth.
  const userId = getUserIdFromQuery(req)
  if (!userId) return NextResponse.json({ error: "Missing user_id" }, { status: 400 })

  const originForErrors = req.nextUrl.origin
  try {
    // Required env vars (server-only):
    // - APP_URL
    // - GOOGLE_CLIENT_ID
    // - GOOGLE_CLIENT_SECRET (used in callback / token exchange)
    const appUrl = normalizeAbsoluteUrl(
      requireServerEnv("APP_URL", "Set it to your Vercel origin, e.g. https://subscription-map-six.vercel.app")
    )
    const clientId = requireServerEnv("GOOGLE_CLIENT_ID")

    const redirectUri = `${appUrl}/api/integrations/google/callback`
    const nonce = crypto.randomUUID()
    const prompt = await shouldPromptForConsent(userId)
    const url = buildGoogleOauthUrl({ userId, redirectUri, clientId, nonce, prompt })

    const res = NextResponse.redirect(url.toString())
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
    const redirectTo = new URL("/settings/integrations", originForErrors)
    redirectTo.searchParams.set("error", "google:config")
    redirectTo.searchParams.set("details", message.slice(0, 600))
    return NextResponse.redirect(redirectTo)
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = await getUserIdFromAccessToken(token)

    // Required env vars (server-only):
    // - APP_URL
    // - GOOGLE_CLIENT_ID
    // - GOOGLE_CLIENT_SECRET (used in callback / token exchange)
    const appUrl = normalizeAbsoluteUrl(
      requireServerEnv("APP_URL", "Set it to your Vercel origin, e.g. https://subscription-map-six.vercel.app")
    )
    const redirectUri = `${appUrl}/api/integrations/google/callback`
    const clientId = requireServerEnv("GOOGLE_CLIENT_ID")
    const nonce = crypto.randomUUID()
    const prompt = await shouldPromptForConsent(userId)
    const url = buildGoogleOauthUrl({ userId, redirectUri, clientId, nonce, prompt })

    const res = NextResponse.json({ url: url.toString() })
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
    return NextResponse.json(
      {
        error: message,
        hint:
          "Required env vars: APP_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.",
      },
      { status: 500 }
    )
  }
}

