import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

import type { AddPlanArgs, AddSubscriptionArgs, AddTaskArgs, Period } from "@/lib/assistant/parse"
import { getIntentPreview, parseInput } from "@/lib/assistant/parse"
import { enqueueSyncJobs } from "@/lib/sync/enqueueSyncJobs"

type AssistantOkResponse = {
  kind: "action" | "query"
  message: string
  data?: unknown
  parsed?: unknown
  preview?: unknown
  sync?: { enqueued: number }
}

type AssistantErrorResponse = {
  kind: "error"
  message: string
  details?: unknown
  parsed?: unknown
  preview?: unknown
}

type AssistantResponse = AssistantOkResponse | AssistantErrorResponse

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`)
  return v
}

function toIsoDateOnly(input: string): string | null {
  const s = input.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  if (Number.isNaN(dt.getTime())) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function parseMaybeIsoDateTime(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  // Prefer explicit ISO forms.
  const iso = new Date(s)
  if (!Number.isNaN(iso.getTime())) return iso.toISOString()
  return null
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

export async function POST(req: NextRequest) {
  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseAnonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json<AssistantResponse>({ kind: "error", message: "Unauthorized" }, { status: 401 })
  }

  let body: { text?: unknown; command?: unknown; userId?: unknown }
  try {
    body = (await req.json()) as { text?: unknown; command?: unknown; userId?: unknown }
  } catch {
    return NextResponse.json<AssistantResponse>({ kind: "error", message: "Invalid JSON body" }, { status: 400 })
  }

  const text =
    typeof body.command === "string"
      ? body.command
      : typeof body.text === "string"
        ? body.text
        : ""
  if (!text.trim()) {
    return NextResponse.json<AssistantResponse>({ kind: "error", message: "Missing `command`" }, { status: 400 })
  }

  // Supabase client bound to the user's JWT for RLS.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const userId = userData?.user?.id ?? null
  if (userError || !userId) {
    return NextResponse.json<AssistantResponse>({ kind: "error", message: "Unauthorized" }, { status: 401 })
  }

  const claimedUserId = typeof body.userId === "string" ? body.userId.trim() : ""
  if (claimedUserId && claimedUserId !== userId) {
    return NextResponse.json<AssistantResponse>({ kind: "error", message: "Unauthorized" }, { status: 401 })
  }

  const { parsed, error: parseError } = parseInput(text)
  const preview = getIntentPreview(parsed)

  async function logEvent(status: "ok" | "error", error?: string) {
    await supabase.from("assistant_events").insert({
      user_id: userId,
      input_text: text,
      parsed,
      status,
      error: error ?? null,
    })
  }

  async function logActivity(kind: "action" | "query" | "error", result: Record<string, unknown>) {
    try {
      await supabase.from("assistant_activity").insert({
        user_id: userId,
        kind,
        command: text,
        result,
      })
    } catch {
      // best-effort; never block the assistant
    }
  }

  if (parseError) {
    await logEvent("error", parseError)
    await logActivity("error", { message: parseError, parsed, preview })
    return NextResponse.json<AssistantResponse>(
      { kind: "error", message: parseError, details: parsed, parsed, preview },
      { status: 400 }
    )
  }

  try {
    if (parsed.kind === "query" && "query" in parsed && parsed.query === "spending") {
      // Monthly total: sum(monthly) + sum(yearly)/12. Yearly total: sum(yearly) + sum(monthly)*12.
      const { data: subs, error } = await supabase
        .from("subscriptions")
        .select("price_cents,period,cancelled")
        .eq("cancelled", false)

      if (error) throw error
      const rows = (subs ?? []) as Array<{ price_cents: number; period: Period; cancelled: boolean }>
      const monthlyTotal = rows.reduce((sum, r) => {
        const price = (r.price_cents ?? 0) / 100
        return sum + (r.period === "monthly" ? price : price / 12)
      }, 0)
      const yearlyTotal = rows.reduce((sum, r) => {
        const price = (r.price_cents ?? 0) / 100
        return sum + (r.period === "yearly" ? price : price * 12)
      }, 0)

      await logEvent("ok")
      await logActivity("query", { message: "spending", data: { monthly_total: monthlyTotal, yearly_total: yearlyTotal } })
      return NextResponse.json<AssistantResponse>({
        kind: "query",
        message: "Here’s what you’re spending.",
        data: { monthly_total: monthlyTotal, yearly_total: yearlyTotal },
        parsed,
        preview,
      })
    }

    if (parsed.kind === "query" && "query" in parsed && parsed.query === "upcoming_renewals") {
      const today = new Date()
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
      const startIso = start.toISOString().slice(0, 10)
      const endIso = end.toISOString().slice(0, 10)

      const { data: subs, error } = await supabase
        .from("subscriptions")
        .select("id,service,renewal_date,price_cents,period,category")
        .eq("cancelled", false)
        .not("renewal_date", "is", null)
        .gte("renewal_date", startIso)
        .lte("renewal_date", endIso)
        .order("renewal_date", { ascending: true })

      if (error) throw error
      await logEvent("ok")
      await logActivity("query", { message: "upcoming_renewals", data: { items: subs ?? [] } })
      return NextResponse.json<AssistantResponse>({
        kind: "query",
        message: "Upcoming renewals in the next 30 days.",
        data: { items: subs ?? [] },
        parsed,
        preview,
      })
    }

    if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_subscription") {
      const args = parsed.args as AddSubscriptionArgs
      if (!args?.service || typeof args.service !== "string" || !args.service.trim()) {
        const msg = "Missing service name."
        await logEvent("error", msg)
        return NextResponse.json<AssistantResponse>({ kind: "error", message: msg }, { status: 400 })
      }
      if (!args?.priceCents || args.priceCents <= 0) {
        const msg = "Missing or invalid price."
        await logEvent("error", msg)
        return NextResponse.json<AssistantResponse>({ kind: "error", message: msg }, { status: 400 })
      }
      if (args.period !== "monthly" && args.period !== "yearly") {
        const msg = "Missing or invalid period."
        await logEvent("error", msg)
        return NextResponse.json<AssistantResponse>({ kind: "error", message: msg }, { status: 400 })
      }

      const category = typeof args.category === "string" && args.category.trim() ? args.category.trim() : "Other"
      const reminderDays = typeof args.remindDays === "number" && args.remindDays > 0 ? Math.floor(args.remindDays) : 3

      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        service: args.service.trim(),
        plan: typeof args.plan === "string" && args.plan.trim() ? args.plan.trim() : null,
        price_cents: args.priceCents,
        period: args.period,
        category,
        cancelled: false,
        reminder_days: reminderDays,
      }
      if (typeof args.renewDate === "string") {
        const d = toIsoDateOnly(args.renewDate)
        if (d) insertPayload.renewal_date = d
      }

      const { data: created, error } = await supabase
        .from("subscriptions")
        .insert(insertPayload)
        .select("id,service,plan,price_cents,period,category,cancelled,renewal_date,reminder_days,created_at")
        .single()

      if (error) throw error
      const sync = await enqueueSyncJobs(supabase, { userId, action: "push_subscription", payload: { record_id: created.id } })
      await logEvent("ok")
      await logActivity("action", { message: "add_subscription", data: created ?? null, sync })
      return NextResponse.json<AssistantResponse>({
        kind: "action",
        message: `Added subscription: ${created?.service ?? args.service}`,
        data: created ?? null,
        parsed,
        preview,
        sync,
      })
    }

    if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_task") {
      const args = parsed.args as AddTaskArgs
      if (!args?.title || typeof args.title !== "string" || !args.title.trim()) {
        const msg = "Missing task title."
        await logEvent("error", msg)
        await logActivity("error", { message: msg, parsed, preview })
        return NextResponse.json<AssistantResponse>({ kind: "error", message: msg }, { status: 400 })
      }
      const dueAt = typeof args.dueAt === "string" ? parseMaybeIsoDateTime(args.dueAt) : null
      const dueDate = dueAt ? dueAt.slice(0, 10) : null
      const { data: created, error } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          title: args.title.trim(),
          due_at: dueAt,
          due_date: dueDate,
          status: "open",
        })
        .select("id,title,due_at,status,created_at")
        .single()

      if (error) throw error
      const sync = await enqueueSyncJobs(supabase, { userId, action: "push_task", payload: { record_id: created.id } })
      await logEvent("ok")
      await logActivity("action", { message: "add_task", data: created ?? null, sync })
      return NextResponse.json<AssistantResponse>({
        kind: "action",
        message: `Added task: ${created?.title ?? args.title}`,
        data: created ?? null,
        parsed,
        preview,
        sync,
      })
    }

    if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_plan") {
      const args = parsed.args as AddPlanArgs
      if (!args?.title || typeof args.title !== "string" || !args.title.trim()) {
        const msg = "Missing plan title."
        await logEvent("error", msg)
        await logActivity("error", { message: msg, parsed, preview })
        return NextResponse.json<AssistantResponse>({ kind: "error", message: msg }, { status: 400 })
      }
      const startDate = typeof args.startDate === "string" ? toIsoDateOnly(args.startDate) : null
      const endDate = typeof args.endDate === "string" ? toIsoDateOnly(args.endDate) : null
      const budgetCents = typeof args.budgetCents === "number" && args.budgetCents > 0 ? Math.floor(args.budgetCents) : null

      const { data: created, error } = await supabase
        .from("plans")
        .insert({
          user_id: userId,
          title: args.title.trim(),
          start_date: startDate,
          end_date: endDate,
          target_date: endDate,
          budget_cents: budgetCents,
        })
        .select("id,title,start_date,end_date,budget_cents,created_at")
        .single()

      if (error) throw error
      const sync = await enqueueSyncJobs(supabase, { userId, action: "push_plan", payload: { record_id: created.id } })
      await logEvent("ok")
      await logActivity("action", { message: "add_plan", data: created ?? null, sync })
      return NextResponse.json<AssistantResponse>({
        kind: "action",
        message: `Added plan: ${created?.title ?? args.title}`,
        data: created ?? null,
        parsed,
        preview,
        sync,
      })
    }

    await logEvent("error", "Unsupported command.")
    await logActivity("error", { message: "Unsupported command.", parsed, preview })
    return NextResponse.json<AssistantResponse>(
      { kind: "error", message: "Unsupported command.", details: parsed, parsed, preview },
      { status: 400 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    await logEvent("error", message)
    await logActivity("error", { message, parsed, preview })
    return NextResponse.json<AssistantResponse>({ kind: "error", message, parsed, preview }, { status: 500 })
  }
}

