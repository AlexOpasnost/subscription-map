import { NextResponse, type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const provider = isRecord(body) && typeof body.provider === "string" ? body.provider.trim() : ""
  if (provider !== "google" && provider !== "notion") {
    return NextResponse.json({ ok: false, error: "Invalid provider" }, { status: 400 })
  }

  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

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

