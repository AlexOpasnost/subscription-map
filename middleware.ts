import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

function requireNextPublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing environment variable: ${name}`)
  return v
}

// Supabase SSR middleware:
// - Ensures the browser session is mirrored in cookies for server route handlers.
// - Refreshes expired sessions and writes updated cookies onto the response.
export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const url = requireNextPublicEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requireNextPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options)
        })
      },
    },
  })

  // Important: triggers session refresh + cookie updates when needed.
  await supabase.auth.getUser()

  return res
}

export const config = {
  matcher: [
    // Run on all routes except Next static assets and common images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

