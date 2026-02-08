import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/env"

/**
 * Server-side Supabase client for a user access token (RLS-safe).
 * Keep this in a server-only module to avoid bundling server env logic into the browser.
 */
export function createSupabaseServerClientForToken(accessToken: string): SupabaseClient {
  const url = requireSupabaseUrl()
  const anon = requireSupabaseAnonKey()
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

