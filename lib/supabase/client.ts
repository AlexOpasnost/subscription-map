import { createClient } from "@supabase/supabase-js"

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env"

const supabaseUrl = getSupabaseUrl() ?? ""
const supabaseAnonKey = getSupabaseAnonKey() ?? ""

// Client-side must never crash due to env vars missing.
// If these are missing, Supabase calls will fail at runtime, but the UI will still render.
if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (or server fallbacks).")
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

