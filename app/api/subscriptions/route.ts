import { NextResponse, type NextRequest } from "next/server"

import {
  createSubscription,
  type CreateSubscriptionInput,
  type SubscriptionRow,
  SubscriptionValidationError,
} from "@/lib/subscriptions/createSubscription"
import { enqueueSyncJobs } from "@/lib/sync/enqueueSyncJobs"
import { supabaseServer } from "@/lib/supabase/server"

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
    // Best-effort enqueue; never block creating the subscription.
    try {
      const sync = await enqueueSyncJobs(supabase, {
        userId: created.user_id,
        action: "upsert",
        targetType: "subscription",
        targetId: created.id,
      })
      return NextResponse.json({ ok: true, data: created, sync })
    } catch {
      return NextResponse.json<Ok>({ ok: true, data: created })
    }
  } catch (err: unknown) {
    console.error("[subscriptions] create failed", err)
    const message =
      err instanceof SubscriptionValidationError ? err.message : err instanceof Error ? err.message : "Couldn’t create subscription."
    const status = err instanceof SubscriptionValidationError ? 400 : 500
    return NextResponse.json<Err>({ ok: false, message, details: err }, { status })
  }
}

