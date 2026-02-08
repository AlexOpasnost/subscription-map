import { createClient } from "@supabase/supabase-js"

// IMPORTANT:
// This module is used in the browser, so it MUST ONLY reference NEXT_PUBLIC_* env vars.
// Do NOT import server env helpers here (dynamic `process.env[name]` won't be inlined client-side).
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim()

// Tiny runtime sanity log (dev only; never prints secrets).
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.log("[supabase] NEXT_PUBLIC_SUPABASE_URL present:", Boolean(supabaseUrl))
}

if (!supabaseUrl) {
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL")
}
if (!supabaseAnonKey) {
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

