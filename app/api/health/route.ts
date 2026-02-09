import { NextResponse, type NextRequest } from "next/server"
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/env"

export async function GET(_req: NextRequest) {
  const timestamp = new Date().toISOString()
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.npm_package_version || "unknown"

  let supabase: "ok" | "fail" = "fail"
  let details: string | null = null
  try {
    const url = requireSupabaseUrl()
    const anon = requireSupabaseAnonKey()
    const res = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/health`, {
      method: "GET",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      cache: "no-store",
    })
    supabase = res.ok ? "ok" : "fail"
    if (!res.ok) details = `Supabase auth health returned HTTP ${res.status}`
  } catch (err: unknown) {
    details = err instanceof Error ? err.message : "Supabase health check failed"
  }

  return NextResponse.json({
    ok: true,
    timestamp,
    version,
    supabase,
    details,
  })
}

