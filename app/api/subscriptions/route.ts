import { NextResponse, type NextRequest } from "next/server"

import {
  createSubscription,
  type CreateSubscriptionInput,
  type SubscriptionRow,
  SubscriptionValidationError,
} from "@/lib/subscriptions/createSubscription"

type Ok = { ok: true; data: SubscriptionRow }
type Err = { ok: false; message: string; details?: unknown }

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

export async function POST(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json<Err>({ ok: false, message: "Not authenticated" }, { status: 401 })
  }

  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json<Err>({ ok: false, message: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const created = await createSubscription(body as CreateSubscriptionInput, { accessToken: token })
    return NextResponse.json<Ok>({ ok: true, data: created })
  } catch (err: unknown) {
    console.error("[subscriptions] create failed", err)
    const message = err instanceof SubscriptionValidationError ? err.message : err instanceof Error ? err.message : "Unexpected error"
    const status = err instanceof SubscriptionValidationError ? 400 : 500
    return NextResponse.json<Err>({ ok: false, message, details: err }, { status })
  }
}

