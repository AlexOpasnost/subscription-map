import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | null = null

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`)
  return v
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return cached
}

