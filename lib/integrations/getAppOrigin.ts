import { getAppOriginServer } from "@/lib/env"

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

