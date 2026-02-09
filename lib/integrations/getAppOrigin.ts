import type { NextRequest } from "next/server"

import { getAppOriginServer, normalizeAbsoluteUrl, readEnv } from "@/lib/env"

/**
 * Server-only helper for integration OAuth redirects.
 *
 * - Prefer `APP_URL` (server-only)
 * - Fallback to `NEXT_PUBLIC_APP_URL`
 * - Fallback to `VERCEL_URL`
 *
 * Throws only on the server when `required=true`.
 */
export function getAppOrigin(opts?: { required?: boolean }): string {
  return getAppOriginServer({ required: opts?.required ?? true }) ?? "http://localhost:3000"
}

/**
 * API-route-safe origin resolver.
 *
 * Priority:
 * - APP_URL (server-only, if present)
 * - NEXT_PUBLIC_APP_URL (optional)
 * - x-forwarded-proto + x-forwarded-host (Vercel/proxy)
 * - host header
 * - req.nextUrl.origin fallback
 */
export function getAppOriginFromRequest(req: NextRequest): string {
  const env = readEnv("APP_URL") ?? readEnv("NEXT_PUBLIC_APP_URL")
  if (env) return normalizeAbsoluteUrl(env)

  const protoRaw = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")
  const hostRaw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host

  const proto = (protoRaw || "https").split(",")[0]!.trim() || "https"
  const host = (hostRaw || "").split(",")[0]!.trim()
  if (host) return `${proto}://${host}`.replace(/\/+$/, "")

  return req.nextUrl.origin
}

