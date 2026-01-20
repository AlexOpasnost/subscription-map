type GetAppUrlOptions = {
  /**
   * When present, used as hostname source for server contexts (e.g. middleware/route handlers).
   * Do NOT call next/headers at module scope; pass headers in from the caller.
   */
  host?: string | null
  proto?: string | null
}

function normalizeAbsoluteUrl(input: string): string {
  const raw = input.trim().replace(/\/+$/, "")
  if (!raw) return ""
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  return `https://${raw}`
}

/**
 * Returns a safe absolute app origin.
 *
 * Priority:
 * - NEXT_PUBLIC_APP_URL (recommended; should include protocol in prod)
 * - NEXT_PUBLIC_SITE_URL (legacy)
 * - VERCEL_URL (hostname only; we prefix https://)
 * - request headers (when provided)
 * - localhost fallback
 */
export function getAppUrl(opts?: GetAppUrlOptions): string {
  const envPreferred = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const envLegacy = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const vercelHost = process.env.VERCEL_URL?.trim()

  const fromEnv = normalizeAbsoluteUrl(envPreferred || envLegacy || "")
  if (fromEnv) return fromEnv

  if (vercelHost) return `https://${vercelHost.replace(/\/+$/, "")}`

  const host = (opts?.host ?? "").trim()
  if (host) {
    const proto = (opts?.proto ?? "").trim() || "https"
    return `${proto}://${host}`.replace(/\/+$/, "")
  }

  if (typeof window !== "undefined") return window.location.origin
  return "http://localhost:3000"
}

