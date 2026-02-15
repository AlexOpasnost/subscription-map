type EnvReadOptions = {
  required?: boolean
  /** Extra context for error messages */
  hint?: string
}

function isServer(): boolean {
  return typeof window === "undefined"
}

function normalize(v: string | undefined): string | undefined {
  const s = (v ?? "").trim()
  return s ? s : undefined
}

/**
 * Safe env reader:
 * - On the client: never throws (returns undefined if missing)
 * - On the server: throws only when required=true
 */
export function readEnv(name: string, opts?: EnvReadOptions): string | undefined {
  const value = normalize(process.env[name])
  if (!value && opts?.required && isServer()) {
    const hint = opts.hint ? ` ${opts.hint}` : ""
    throw new Error(`Missing environment variable: ${name}.${hint}`)
  }
  return value
}

/**
 * Server-only required env reader.
 * Returns `string` (typed), throws if missing.
 *
 * Note: If this is accidentally executed on the client, it will return an empty string
 * rather than crashing the UI. (But it should never be called from client code.)
 */
export function requireServerEnv(name: string, hint?: string): string {
  if (!isServer()) return ""
  const v = readEnv(name)
  if (!v) {
    const extra = hint ? ` ${hint}` : ""
    throw new Error(`Missing environment variable: ${name}.${extra}`)
  }
  return v
}

/**
 * Server-only env reader that FAILS if called on the client.
 * Use this for secrets like SUPABASE_SERVICE_ROLE_KEY.
 */
export function requireServerOnlyEnv(name: string, hint?: string): string {
  if (!isServer()) {
    throw new Error(`Server-only environment variable accessed on the client: ${name}`)
  }
  return requireServerEnv(name, hint)
}

export function getAppOriginServer(opts?: { required?: boolean }): string | undefined {
  // Prefer server-only APP_URL, but allow NEXT_PUBLIC_APP_URL as fallback.
  const appUrl = readEnv("APP_URL") ?? readEnv("NEXT_PUBLIC_APP_URL")
  const vercelHost = readEnv("VERCEL_URL")

  const origin = appUrl
    ? normalizeAbsoluteUrl(appUrl)
    : vercelHost
      ? `https://${vercelHost.replace(/\/+$/, "")}`
      : undefined

  if (!origin && opts?.required) {
    // Only throws on server.
    readEnv("APP_URL", {
      required: true,
      hint: "Set it to your deployment origin, e.g. https://your-domain",
    })
  }
  return origin
}

export function getAppOriginClient(): string {
  // Client never throws.
  if (typeof window !== "undefined") return window.location.origin
  return ""
}

export function getAppOriginBestEffort(): string {
  return (isServer() ? getAppOriginServer() : getAppOriginClient()) || "http://localhost:3000"
}

export function normalizeAbsoluteUrl(input: string): string {
  const raw = input.trim().replace(/\/+$/, "")
  if (!raw) return ""
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  return `https://${raw}`
}

export function requireAppUrlOrigin(): string {
  // Production requires APP_URL; keep errors explicit.
  return normalizeAbsoluteUrl(
    requireServerEnv("APP_URL", "Set it to your deployment origin, e.g. https://subscription-map-six.vercel.app")
  )
}

/**
 * Supabase env helpers (safe fallbacks).
 *
 * Rules:
 * - SUPABASE_URL -> SUPABASE_URL ?? NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_ANON_KEY -> SUPABASE_ANON_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY -> ONLY SUPABASE_SERVICE_ROLE_KEY (server-only; no fallback)
 */
export function getSupabaseUrl(): string | undefined {
  return readEnv("SUPABASE_URL") ?? readEnv("NEXT_PUBLIC_SUPABASE_URL")
}

export function getSupabaseAnonKey(): string | undefined {
  return readEnv("SUPABASE_ANON_KEY") ?? readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

export function requireSupabaseUrl(): string {
  const v = getSupabaseUrl()
  if (!v) throw new Error("Missing environment variable: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).")
  return v
}

export function requireSupabaseAnonKey(): string {
  const v = getSupabaseAnonKey()
  if (!v) throw new Error("Missing environment variable: SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).")
  return v
}

export function requireSupabaseServiceRoleKey(): string {
  return requireServerOnlyEnv("SUPABASE_SERVICE_ROLE_KEY")
}

