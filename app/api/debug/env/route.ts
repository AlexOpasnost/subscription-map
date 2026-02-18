import { NextResponse, type NextRequest } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"

function present(name: string): boolean {
  const v = process.env[name]
  return !!(v && v.trim())
}

export async function GET(req: NextRequest) {
  // Require auth so random users can’t probe env presence.
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  // Booleans only: never return values or secrets.
  return NextResponse.json({
    ok: true,
    env: {
      APP_URL: present("APP_URL"),
      NEXT_PUBLIC_APP_URL: present("NEXT_PUBLIC_APP_URL"),
      NEXT_PUBLIC_SITE_URL: present("NEXT_PUBLIC_SITE_URL"),
      VERCEL_URL: present("VERCEL_URL"),

      NEXT_PUBLIC_SUPABASE_URL: present("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: present("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      SUPABASE_URL: present("SUPABASE_URL"),
      SUPABASE_ANON_KEY: present("SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: present("SUPABASE_SERVICE_ROLE_KEY"),

      GOOGLE_CLIENT_ID: present("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: present("GOOGLE_CLIENT_SECRET"),

      OPENAI_API_KEY: present("OPENAI_API_KEY"),
      OPENAI_MODEL: present("OPENAI_MODEL"),

      ADMIN_EMAILS: present("ADMIN_EMAILS"),

      SENTRY_DSN: present("SENTRY_DSN"),
      NEXT_PUBLIC_SENTRY_DSN: present("NEXT_PUBLIC_SENTRY_DSN"),
    },
  })
}

