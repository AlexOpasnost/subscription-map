import { NextResponse, type NextRequest } from "next/server"

import {
  createSubscription,
  type CreateSubscriptionInput,
  type SubscriptionRow,
  SubscriptionValidationError,
} from "@/lib/subscriptions/createSubscription"
import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { scheduleSubscriptionNotifications } from "@/lib/notifications/schedule"

type Ok = { ok: true; data: SubscriptionRow }
type Err = { ok: false; message: string; details?: unknown }

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json<Err>({ ok: false, message: "Not authenticated" }, { status: 401 })
  }

  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json<Err>({ ok: false, message: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const created = await createSubscription(body as CreateSubscriptionInput, { supabase })
    // Schedule internal notifications (server-side; best-effort).
    const admin = getSupabaseAdmin()
    let notifications: { scheduled: number; skipped?: boolean; reason?: string } | null = null
    try {
      const out = await scheduleSubscriptionNotifications(admin, {
        userId: created.user_id,
        subscriptionId: created.id,
        service: created.service,
        renewal_date: created.renewal_date ?? null,
        reminder_days: typeof (created as any).reminder_days === "number" ? Number((created as any).reminder_days) : null,
      })
      notifications = { scheduled: out.scheduled, skipped: out.skipped, reason: out.reason }
      console.log("[subscriptions] notifications scheduled", {
        userId: created.user_id,
        subscriptionId: created.id,
        scheduled: out.scheduled,
        skipped: out.skipped,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Notification scheduling failed"
      console.error("[subscriptions] notifications schedule failed", { userId: created.user_id, subscriptionId: created.id, error: msg })
      notifications = { scheduled: 0, skipped: true, reason: msg }
    }

    return NextResponse.json({ ok: true, data: created, notifications })
  } catch (err: unknown) {
    console.error("[subscriptions] create failed", err)
    const message =
      err instanceof SubscriptionValidationError ? err.message : err instanceof Error ? err.message : "Couldn’t create subscription."
    const status = err instanceof SubscriptionValidationError ? 400 : 500
    return NextResponse.json<Err>({ ok: false, message, details: err }, { status })
  }
}

