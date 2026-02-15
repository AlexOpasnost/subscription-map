import { NextResponse } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { createGoogleCalendarEventForUser } from "@/lib/google/createEvent"

export async function POST() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const start = new Date(Date.now() + 5 * 60_000)
  const end = new Date(start.getTime() + 30 * 60_000)

  const { eventId, htmlLink } = await createGoogleCalendarEventForUser({
    userId: user.id,
    event: {
      summary: "Subscription Map — Test event",
      description: "Created by /api/integrations/google/test-create-event",
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  })

  return NextResponse.json({ ok: true, eventId, htmlLink })
}

export async function GET() {
  return POST()
}

