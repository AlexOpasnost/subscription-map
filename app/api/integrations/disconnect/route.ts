import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/env"

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

export async function POST(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const provider = typeof (body as any)?.provider === "string" ? String((body as any).provider).trim() : ""
  if (provider !== "google" && provider !== "notion") {
    return NextResponse.json({ ok: false, error: "Invalid provider" }, { status: 400 })
  }

  const supabaseUrl = requireSupabaseUrl()
  const supabaseAnonKey = requireSupabaseAnonKey()
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  // Prefer marking as disconnected (if `status` exists); fall back to delete for older schemas.
  const [{ error: updErr }, { error: linkErr }] = await Promise.all([
    supabase
      .from("integrations")
      .update({ status: "disconnected", access_token: "", refresh_token: null, expires_at: null })
      .eq("user_id", user.id)
      .eq("provider", provider),
    supabase.from("external_links").delete().eq("user_id", user.id).eq("provider", provider),
  ])
  if (linkErr) return NextResponse.json({ ok: false, error: linkErr.message }, { status: 500 })
  if (updErr) {
    // Older schema: delete the row entirely.
    const { error: intErr } = await supabase.from("integrations").delete().eq("user_id", user.id).eq("provider", provider)
    if (intErr) return NextResponse.json({ ok: false, error: intErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

