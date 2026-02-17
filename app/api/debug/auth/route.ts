import { NextResponse } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { authenticated: false, user_id: null, email: null },
      { status: 401 }
    )
  }

  return NextResponse.json({
    authenticated: true,
    user_id: user.id,
    email: user.email ?? null,
  })
}

