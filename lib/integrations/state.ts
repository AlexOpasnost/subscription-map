import crypto from "crypto"
import { requireSupabaseServiceRoleKey } from "@/lib/env"

type StatePayload = {
  userId: string
  provider: "google" | "notion"
  exp: number // unix seconds
  nonce: string
}

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function base64UrlDecode(input: string): Buffer {
  const padLen = (4 - (input.length % 4)) % 4
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen)
  return Buffer.from(padded, "base64")
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8")
  const bb = Buffer.from(b, "utf8")
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

function getStateSecret(): string {
  // Reuse SUPABASE_SERVICE_ROLE_KEY so we don't introduce a new required env var.
  return requireSupabaseServiceRoleKey()
}

export function signIntegrationState(payload: Omit<StatePayload, "nonce"> & { nonce?: string }): string {
  const state: StatePayload = {
    ...payload,
    nonce: payload.nonce ?? crypto.randomUUID(),
  }
  const json = JSON.stringify(state)
  const body = base64UrlEncode(json)
  const sig = crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url")
  return `${body}.${sig}`
}

export function verifyIntegrationState(state: string): StatePayload {
  const [body, sig] = state.split(".", 2)
  if (!body || !sig) throw new Error("Invalid state")
  const expected = crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url")
  if (!timingSafeEqual(sig, expected)) throw new Error("Invalid state signature")
  const json = base64UrlDecode(body).toString("utf8")
  const parsed = JSON.parse(json) as unknown

  if (typeof parsed !== "object" || parsed === null) throw new Error("Invalid state payload")
  const p = parsed as Record<string, unknown>
  const userId = typeof p.userId === "string" ? p.userId : ""
  const provider = p.provider === "google" || p.provider === "notion" ? p.provider : null
  const exp = typeof p.exp === "number" ? p.exp : 0
  const nonce = typeof p.nonce === "string" ? p.nonce : ""

  if (!userId) throw new Error("Invalid state: missing userId")
  if (!provider) throw new Error("Invalid state: missing provider")
  if (!nonce) throw new Error("Invalid state: missing nonce")
  if (!Number.isFinite(exp) || exp <= 0) throw new Error("Invalid state: missing exp")

  const now = Math.floor(Date.now() / 1000)
  if (exp < now) throw new Error("State expired")

  return { userId, provider, exp, nonce }
}

