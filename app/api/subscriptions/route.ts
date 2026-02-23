import { NextResponse, type NextRequest } from "next/server"

import {
  createSubscription,
  type CreateSubscriptionInput,
  type SubscriptionRow,
  SubscriptionValidationError,
} from "@/lib/subscriptions/createSubscription"
import { enqueueSyncJobs } from "@/lib/sync/enqueueSyncJobs"
import { supabaseServer } from "@/lib/supabase/server"
import { pushToGoogleCalendar } from "@/lib/sync/providers/googleCalendar"
import type { IntegrationRow } from "@/lib/sync/types"

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
      // Also create the Calendar event immediately (no worker required). Best-effort only.
      let google: { ok: boolean; status?: string; eventId?: string; error?: string } | null = null
      try {
        const { data: integration } = await supabase
          .from("integrations")
          .select("id,user_id,provider,access_token,refresh_token,expires_at,scope,meta,metadata,created_at,status")
          .eq("user_id", user.id)
          .eq("provider", "google")
          .maybeSingle()

        const status = typeof (integration as any)?.status === "string" ? String((integration as any).status) : ""
        if (!integration || (status && status.toLowerCase() === "disconnected")) {
          google = { ok: false, error: "NOT_CONNECTED" }
        } else {
          const out = await pushToGoogleCalendar(supabase, integration as unknown as IntegrationRow, {
            action: "upsert",
            targetType: "subscription",
            targetId: created.id,
            log: async (msg: string) => {
              console.log(`[subscriptions] google sync user_id=${user.id} subscription_id=${created.id} ${msg}`)
            },
          })
          google = { ok: true, status: "ok", eventId: out?.eventId }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Google sync failed"
        console.error("[subscriptions] google sync failed", { userId: user.id, subscriptionId: created.id, error: msg })
        google = { ok: false, error: msg.includes("Missing refresh token") ? "NEEDS_RECONNECT" : msg }
      }

      return NextResponse.json({ ok: true, data: created, sync, google })
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

