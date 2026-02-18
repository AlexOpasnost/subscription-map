import { NextResponse } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    return NextResponse.json({ userId: null, email: null, error: error.message }, { status: 401 })
  }
  if (!user) {
    return NextResponse.json({ userId: null, email: null }, { status: 401 })
  }

  return NextResponse.json({ userId: user.id, email: user.email ?? null })
}

