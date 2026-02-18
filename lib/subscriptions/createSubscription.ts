import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js"

export type SubscriptionPeriod = "monthly" | "yearly"

export type SubscriptionRow = {
  id: string
  user_id: string
  service: string
  plan: string | null
  price_cents: number
  period: SubscriptionPeriod
  category: string
  cancelled: boolean
  cancel_url: string | null
  reminder_days: number
  renewal_date: string | null
  created_at: string
  notes?: string | null
}

export type CreateSubscriptionInput = {
  service: string
  plan?: string | null
  priceCents: number
  period?: SubscriptionPeriod
  category?: string | null
  cancelUrl?: string | null
  reminderDays?: number | null
  renewalDate?: string | null
  cancelled?: boolean
}

class CreateSubscriptionError extends Error {
  code?: string
  details?: string | null
  hint?: string | null
  original?: unknown

  constructor(message: string, opts?: { code?: string; details?: string | null; hint?: string | null; original?: unknown }) {
    super(message)
    this.name = "CreateSubscriptionError"
    this.code = opts?.code
    this.details = opts?.details
    this.hint = opts?.hint
    this.original = opts?.original
  }
}

class SubscriptionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SubscriptionValidationError"
  }
}

function normalizeText(input: unknown, opts?: { maxLen?: number; allowEmpty?: boolean }): string {
  const maxLen = opts?.maxLen ?? 200
  const allowEmpty = opts?.allowEmpty ?? false
  const s = typeof input === "string" ? input : ""
  const trimmed = s.trim().replace(/\s+/g, " ").replace(/[<>]/g, "")
  const clipped = trimmed.slice(0, maxLen)
  if (!allowEmpty && !clipped) return ""
  return clipped
}

function requireAccessTokenOnServer(accessToken: string | undefined): string {
  if (typeof window !== "undefined") return accessToken ?? ""
  if (!accessToken || !accessToken.trim()) {
    throw new CreateSubscriptionError("Missing access token (server-side).", { details: "No Authorization bearer token was provided." })
  }
  return accessToken.trim()
}

function buildSupabaseClientForToken(accessToken: string) {
  // NOTE: This module is imported by client components.
  // To avoid client-bundle crashes, ONLY reference NEXT_PUBLIC_* env vars here.
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim()
  if (!supabaseUrl) throw new CreateSubscriptionError("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL")
  if (!supabaseAnonKey) throw new CreateSubscriptionError("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY")

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function throwPostgrest(context: string, err: PostgrestError): never {
  const details = err.details ?? null
  const hint = err.hint ?? null
  const code = err.code ?? undefined
  const suffix = [details, hint, code ? `code=${code}` : null].filter(Boolean).join(" • ")
  const msg = suffix ? `${context}: ${err.message} (${suffix})` : `${context}: ${err.message}`
  throw new CreateSubscriptionError(msg, { code, details, hint, original: err })
}

function validateAndNormalize(input: CreateSubscriptionInput): Required<Omit<CreateSubscriptionInput, "cancelled">> & { cancelled: boolean } {
  const service = normalizeText(input.service, { maxLen: 120 })
  if (!service) throw new SubscriptionValidationError("Service is required.")

  const priceCents = Number.isFinite(input.priceCents) ? Math.floor(input.priceCents) : NaN
  if (!Number.isFinite(priceCents) || priceCents <= 0) throw new SubscriptionValidationError("Price must be greater than 0.")

  const period: SubscriptionPeriod = input.period === "yearly" ? "yearly" : "monthly"

  const categoryRaw = normalizeText(input.category ?? "", { maxLen: 50, allowEmpty: true })
  const category = categoryRaw || "Other"

  const planRaw = normalizeText(input.plan ?? "", { maxLen: 80, allowEmpty: true })
  const plan = planRaw || null

  const cancelUrlRaw = normalizeText(input.cancelUrl ?? "", { maxLen: 800, allowEmpty: true })
  const cancelUrl = cancelUrlRaw || null

  const reminderDays =
    typeof input.reminderDays === "number" && Number.isFinite(input.reminderDays) && input.reminderDays > 0
      ? Math.floor(input.reminderDays)
      : null

  const renewalDate = normalizeText(input.renewalDate ?? "", { maxLen: 40, allowEmpty: true }) || null
  const cancelled = Boolean(input.cancelled ?? false)

  return { service, plan, priceCents, period, category, cancelUrl, reminderDays, renewalDate, cancelled }
}

async function createSubscriptionWithClient(input: CreateSubscriptionInput, supabase: SupabaseClient): Promise<SubscriptionRow> {
  const normalized = validateAndNormalize(input)

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new CreateSubscriptionError(`Auth error: ${authError.message}`, { original: authError })
  if (!user) throw new CreateSubscriptionError("Not authenticated.")

  const payload: Record<string, unknown> = {
    user_id: user.id,
    service: normalized.service,
    plan: normalized.plan,
    price_cents: normalized.priceCents,
    period: normalized.period,
    category: normalized.category,
    cancelled: normalized.cancelled,
    cancel_url: normalized.cancelUrl,
  }
  if (normalized.reminderDays !== null) payload.reminder_days = normalized.reminderDays
  if (normalized.renewalDate !== null) payload.renewal_date = normalized.renewalDate

  const { data: created, error } = await supabase
    .from("subscriptions")
    .insert(payload)
    .select("id,user_id,service,plan,price_cents,period,category,cancelled,cancel_url,renewal_date,reminder_days,created_at,notes")
    .single()

  if (error) throwPostgrest("Couldn’t create subscription", error)
  if (!created) throw new CreateSubscriptionError("Couldn’t create subscription: no row returned.")
  return created as SubscriptionRow
}

type CreateSubscriptionOptions = {
  /**
   * Prefer providing a Supabase client (cookie-auth in route handlers).
   * If omitted on the server, `accessToken` is required as a fallback.
   */
  supabase?: SupabaseClient
  accessToken?: string
}

/**
 * Create a subscription using a single, RLS-safe server-side write path.
 *
 * - In the browser: calls `/api/subscriptions` with the current session access token.
 * - On the server: validates input, fetches the authenticated user (via token), inserts, returns the inserted row.
 */
export async function createSubscription(input: CreateSubscriptionInput, opts?: CreateSubscriptionOptions): Promise<SubscriptionRow> {
  if (typeof window !== "undefined") {
    // Browser path: call our API so user_id always comes from server-side auth.
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(input),
    })

    let json: unknown = null
    try {
      json = (await res.json()) as unknown
    } catch (err) {
      // If the server returned non-JSON, surface a stable error.
      throw new CreateSubscriptionError("Couldn’t create subscription: invalid server response.", { original: err })
    }

    if (!res.ok) {
      const msg =
        typeof json === "object" && json !== null && "message" in json && typeof (json as { message?: unknown }).message === "string"
          ? (json as { message: string }).message
          : "Couldn’t create subscription."
      throw new CreateSubscriptionError(msg, { original: json })
    }

    if (typeof json === "object" && json !== null && "data" in json) {
      return (json as { data: SubscriptionRow }).data
    }
    // Back-compat if we ever return the row directly.
    return json as SubscriptionRow
  }

  if (opts?.supabase) {
    return await createSubscriptionWithClient(input, opts.supabase)
  }

  const accessToken = requireAccessTokenOnServer(opts?.accessToken)
  const supabase = buildSupabaseClientForToken(accessToken)
  return await createSubscriptionWithClient(input, supabase)
}

export { CreateSubscriptionError, SubscriptionValidationError }

