import { NextResponse } from "next/server"

import { supabaseServer } from "@/lib/supabase/server"
import { GoogleReconnectRequiredError, upsertGoogleCalendarEventForUser } from "@/lib/google/calendar"

export async function POST() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const userId = user.id
  console.log("[integrations/google/test-event] start", { userId })
  const start = new Date(Date.now() + 2 * 60_000)
  try {
    const out = await upsertGoogleCalendarEventForUser(supabase, {
      userId,
      title: "Subscription Map Test Event",
      dueAt: start.toISOString(),
      calendarId: "primary",
      existingEventId: null,
    })
    return NextResponse.json({ ok: true, eventId: out.eventId, htmlLink: out.htmlLink ?? "" })
  } catch (err: unknown) {
    if (err instanceof GoogleReconnectRequiredError) {
      return NextResponse.json({ ok: false, error: "NO_REFRESH_TOKEN" }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : "Failed to create event"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET() {
  return POST()
}

