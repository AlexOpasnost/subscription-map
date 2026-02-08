import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import "server-only"

import { requireSupabaseServiceRoleKey, requireSupabaseUrl } from "@/lib/env"

let cached: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached
  const url = requireSupabaseUrl()
  const serviceRoleKey = requireSupabaseServiceRoleKey()
  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return cached
}

