import { NextResponse, type NextRequest } from "next/server"

import { ActionSchema, type Action } from "@/lib/assistant/actionSchema"
import { requireServerEnv, requireSupabaseServiceRoleKey } from "@/lib/env"
import { supabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { createSubscription } from "@/lib/subscriptions/createSubscription"
import { getUserIdFromAccessToken } from "@/lib/supabase/userFromBearer"
import { syncGoogleCalendarEvent } from "@/lib/sync/providers/googleCalendar"

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function isoTodayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysDateOnly(isoDateOnly: string, days: number): string {
  const dt = new Date(`${isoDateOnly}T00:00:00.000Z`)
  return new Date(dt.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

type ExecuteResponse =
  | { ok: true; action: Action; result?: unknown; message?: string }
  | { ok: false; error: string; action?: Action }

export async function POST(req: NextRequest) {
  try {
    requireSupabaseServiceRoleKey()
    requireServerEnv("APP_URL")
    // Not used in this endpoint, but required by product spec.
    requireServerEnv("OPENAI_API_KEY")
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Missing environment variables."
    return NextResponse.json<ExecuteResponse>({ ok: false, error: msg }, { status: 500 })
  }

  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json<ExecuteResponse>({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const actionRaw = (body as any)?.action as unknown
  const parsed = ActionSchema.safeParse(actionRaw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
    return NextResponse.json<ExecuteResponse>({ ok: false, error: msg }, { status: 400 })
  }
  const action = parsed.data

  const inputText = typeof (body as any)?.text === "string" ? String((body as any).text).trim() : ""

  // Validate user session (cookies-based SSR client).
  const authSb = await supabaseServer()
  const {
    data: { user },
  } = await authSb.auth.getUser()
  let userId = user?.id ?? ""
  const bearer = getBearerToken(req)
  if (!userId && bearer) {
    try {
      userId = await getUserIdFromAccessToken(bearer)
    } catch {
      // ignore
    }
  }
  if (!userId) return NextResponse.json<ExecuteResponse>({ ok: false, error: "Not authenticated" }, { status: 401 })

  // Use service role for inserts (avoids RLS/policy drift across environments).
  const admin = getSupabaseAdmin()

  console.log("[assistant/execute] parsed action", { userId, actionType: action.type, action })

  async function log(kind: string, result: Record<string, unknown>) {
    try {
      const { error } = await admin.from("assistant_activity").insert({
        user_id: userId,
        kind,
        command: inputText || JSON.stringify(action),
        result,
        input_text: inputText || JSON.stringify(action),
        intent: action as unknown,
        status: "ok",
        error: null,
      })
      if (error) console.error("[assistant/execute] assistant_activity insert error", error)
    } catch {
      // best-effort
    }
  }

  if (action.type === "unsupported") {
    await log("ai_execute", { message: "Unsupported", action })
    return NextResponse.json<ExecuteResponse>({ ok: true, action, message: action.reason, result: { suggestions: action.suggestions } })
  }

  async function maybeEnqueueGoogleSync(input: { targetType: "task" | "reminder"; targetId: string }) {
    try {
      const { data: integration, error } = await admin
        .from("integrations")
        .select("provider,status,meta,metadata")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle()
      if (error) {
        console.error("[assistant/execute] integrations select error", error)
        return
      }
      if (!integration) return
      const status = typeof (integration as any).status === "string" ? String((integration as any).status) : ""
      if (status && status.toLowerCase() === "disconnected") return

      const legacyAction = input.targetType === "task" ? "push_task" : "push_reminder"
      const { data: inserted, error: insertErr } = await admin
        .from("sync_jobs")
        .insert({
          user_id: userId,
          provider: "google",
          target_type: input.targetType,
          target_id: input.targetId,
          action: "upsert",
          status: "pending",
          attempts: 0,
          last_error: null,
          legacy_action: legacyAction,
          legacy_payload: { record_id: input.targetId },
          legacy_status: "queued",
        })
        .select("id")
        .maybeSingle()
      if (insertErr) {
        console.error("[assistant/execute] sync_jobs insert error", insertErr)
        return
      }
      console.log("[assistant/execute] sync job created", { provider: "google", jobId: (inserted as any)?.id ?? null })
    } catch (err) {
      console.error("[assistant/execute] sync enqueue failed", err)
    }
  }

  if (action.type === "add_task") {
    const dueDate = action.due_date ?? null
    const { data: created, error } = await admin
      .from("tasks")
      .insert({
        user_id: userId,
        title: action.title,
        due_date: dueDate,
        due_at: null,
        notes: action.notes ?? null,
        status: "open",
      })
      .select("id,title,due_date,created_at")
      .single()
    if (error) return NextResponse.json<ExecuteResponse>({ ok: false, error: error.message, action }, { status: 500 })

    // Optional reminder: store as an offset rule (computed in timeline), but also set remind_at so it shows immediately.
    let reminderId: string | null = null
    if (dueDate && typeof action.remind_days_before === "number" && action.remind_days_before > 0) {
      const offsetDays = Math.floor(action.remind_days_before)
      const remindDate = addDaysDateOnly(dueDate, -offsetDays)
      const remindAtIso = new Date(`${remindDate}T09:00:00.000Z`).toISOString()
      const { data: reminder, error: remErr } = await admin
        .from("reminders")
        .insert({
        user_id: userId,
        kind: "task",
        target_type: "task",
        target_id: created.id,
        title: action.title,
        rule_type: "offset_before",
        offset_days: offsetDays,
        anchor_field: "due_date",
        remind_at: remindAtIso,
        channel: "in_app",
      })
        .select("id")
        .maybeSingle()
      if (remErr) console.error("[assistant/execute] reminders insert error", remErr)
      reminderId = typeof (reminder as any)?.id === "string" ? String((reminder as any).id) : null
    }

    console.log("[assistant/execute] task insert result", { taskId: (created as any)?.id ?? null })
    await log("ai_execute", { message: "Task created", created, reminderId })
    await maybeEnqueueGoogleSync({ targetType: "task", targetId: created.id })
    return NextResponse.json<ExecuteResponse>({
      ok: true,
      action,
      message: "Saved task.",
      result: { task: created, id: created.id, reminderId },
    })
  }

  if (action.type === "add_subscription") {
    // Enforce critical fields at execution time (parser should ideally avoid this).
    if (!action.price_cents || !action.period) {
      return NextResponse.json<ExecuteResponse>(
        {
          ok: false,
          error: "Missing price or period. Try: “Add Spotify subscription $14.99 monthly”.",
          action,
        },
        { status: 400 }
      )
    }

    const {
      data: { session },
    } = await authSb.auth.getSession()
    const accessToken = session?.access_token ?? bearer ?? ""
    if (!accessToken) return NextResponse.json<ExecuteResponse>({ ok: false, error: "Not authenticated" }, { status: 401 })

    const created = await createSubscription(
      {
        service: action.service,
        plan: (action.plan ?? "Standard").trim() || "Standard",
        priceCents: action.price_cents,
        period: action.period,
        category: (action.category ?? "Other").trim() || "Other",
        renewalDate: action.next_renewal ?? null,
        reminderDays: typeof action.remind_days_before === "number" ? Math.floor(action.remind_days_before) : null,
      },
      // Use cookie-bound auth for createSubscription (it expects user context).
      { accessToken }
    )

    console.log("[assistant/execute] subscription insert result", { subscriptionId: (created as any)?.id ?? null })
    await log("ai_execute", { message: "Subscription created", created })
    return NextResponse.json<ExecuteResponse>({
      ok: true,
      action,
      message: "Saved subscription.",
      result: { subscription: created, id: (created as any)?.id ?? null },
    })
  }

  if (action.type === "add_plan") {
    const startDate = action.date ?? null
    const { data: created, error } = await admin
      .from("plans")
      .insert({
        user_id: userId,
        title: action.title,
        start_date: startDate,
        end_date: null,
        notes: action.notes ?? null,
      })
      .select("id,title,start_date,notes,created_at")
      .single()
    if (error) return NextResponse.json<ExecuteResponse>({ ok: false, error: error.message, action }, { status: 500 })

    console.log("[assistant/execute] plan insert result", { planId: (created as any)?.id ?? null })
    await log("ai_execute", { message: "Plan created", created })

    // Best-effort: immediately sync to Google Calendar (idempotent + logged).
    try {
      const planId = String((created as any)?.id ?? "")
      if (planId) {
        const sync = await syncGoogleCalendarEvent({ supabase: admin, userId, planId })
        console.log("[assistant/execute] plan google sync result", { planId, sync })
      }
    } catch (err) {
      console.error("[assistant/execute] plan google sync error", err)
    }
    return NextResponse.json<ExecuteResponse>({ ok: true, action, message: "Saved plan.", result: { plan: created, id: created.id } })
  }

  if (action.type === "question_spending") {
    const timeframe = action.timeframe ?? "month"
    const { data: subs, error } = await admin
      .from("subscriptions")
      .select("price_cents,period,cancelled")
      .eq("user_id", userId)
      .eq("cancelled", false)
    if (error) return NextResponse.json<ExecuteResponse>({ ok: false, error: error.message, action }, { status: 500 })

    const rows = (subs ?? []) as Array<{ price_cents: number; period: "monthly" | "yearly" }>
    const monthlyTotal = rows.reduce((sum, r) => sum + (r.period === "monthly" ? r.price_cents / 100 : r.price_cents / 100 / 12), 0)
    const yearlyTotal = rows.reduce((sum, r) => sum + (r.period === "yearly" ? r.price_cents / 100 : (r.price_cents / 100) * 12), 0)
    const result =
      timeframe === "month"
        ? { timeframe, monthly_total: monthlyTotal }
        : timeframe === "year"
          ? { timeframe, yearly_total: yearlyTotal }
          : { timeframe, monthly_total: monthlyTotal, yearly_total: yearlyTotal }

    await log("ai_execute", { message: "Spending query", result })
    return NextResponse.json<ExecuteResponse>({ ok: true, action, result })
  }

  if (action.type === "timeline") {
    const from = action.from ?? isoTodayUtc()
    const to = action.to ?? addDaysDateOnly(from, 7)

    const [{ data: tasks, error: tErr }, { data: subs, error: sErr }] = await Promise.all([
      admin
        .from("tasks")
        .select("id,title,due_date,due_at,status")
        .eq("user_id", userId)
        .eq("status", "open")
        .gte("due_date", from)
        .lte("due_date", to)
        .limit(200),
      admin
        .from("subscriptions")
        .select("id,service,renewal_date,price_cents,period,category")
        .eq("user_id", userId)
        .eq("cancelled", false)
        .not("renewal_date", "is", null)
        .gte("renewal_date", from)
        .lte("renewal_date", to)
        .limit(200),
    ])

    if (tErr) return NextResponse.json<ExecuteResponse>({ ok: false, error: tErr.message, action }, { status: 500 })
    if (sErr) return NextResponse.json<ExecuteResponse>({ ok: false, error: sErr.message, action }, { status: 500 })

    const items = [
      ...(tasks ?? []).map((t: any) => ({
        type: "task" as const,
        title: String(t.title ?? "Task"),
        date: t.due_at ? String(t.due_at) : t.due_date ? new Date(`${t.due_date}T09:00:00.000Z`).toISOString() : null,
        meta: { id: t.id },
      })),
      ...(subs ?? []).map((s: any) => ({
        type: "subscription" as const,
        title: `Renewal: ${String(s.service ?? "Subscription")}`,
        date: s.renewal_date ? new Date(`${s.renewal_date}T09:00:00.000Z`).toISOString() : null,
        meta: { id: s.id, price_cents: s.price_cents, period: s.period, category: s.category },
      })),
    ]
      .filter((x) => typeof x.date === "string" && x.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))

    const result = { from, to, items }
    await log("ai_execute", { message: "Timeline query", result })
    return NextResponse.json<ExecuteResponse>({ ok: true, action, result })
  }

  return NextResponse.json<ExecuteResponse>({ ok: false, error: "Unsupported action", action }, { status: 400 })
}

