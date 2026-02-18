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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = req.nextUrl.pathname
  const isLogin = path === "/login"
  const isDashboard = path === "/dashboard" || path.startsWith("/dashboard/")

  // Auth redirects (server-side, avoids client-side flicker).
  if (isLogin && user) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }
  if (isDashboard && !user) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return res
}

export const config = {
  matcher: [
    // Run on all routes except Next static assets and common images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

