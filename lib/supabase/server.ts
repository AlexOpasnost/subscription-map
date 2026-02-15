import "server-only"

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

function requireNextPublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const v = process.env[name]?.trim()
  if (!v) {
    // Server-side only; fail fast in production.
    throw new Error(`Missing environment variable: ${name}`)
  }
  return v
}

/**
 * Supabase server client for Next.js App Router route handlers.
 *
 * - Uses `@supabase/ssr` so auth is derived from cookies (no Bearer header needed).
 * - Uses NEXT_PUBLIC Supabase env vars (safe to expose; required by spec).
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  const url = requireNextPublicEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requireNextPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  type CookieStore = typeof cookieStore
  type CookieSetOptions = Parameters<CookieStore["set"]>[2]

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as CookieSetOptions)
          })
        } catch {
          // `cookies().set()` can throw in Server Components; safe to ignore there.
        }
      },
    },
  })
}


