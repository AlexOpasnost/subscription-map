import { createClient } from "@supabase/supabase-js"
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/env"

export async function getUserIdFromAccessToken(accessToken: string): Promise<string> {
  const supabaseUrl = requireSupabaseUrl()
  const supabaseAnonKey = requireSupabaseAnonKey()

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error) throw error
  const userId = data.user?.id
  if (!userId) throw new Error("Unauthorized")
  return userId
}

