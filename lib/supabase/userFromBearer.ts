import { createClient } from "@supabase/supabase-js"

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`)
  return v
}

export async function getUserIdFromAccessToken(accessToken: string): Promise<string> {
  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseAnonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

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

