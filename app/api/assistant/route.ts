import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

import type { AddPlanArgs, AddSubscriptionArgs, AddTaskArgs, Period } from "@/lib/assistant/parse"
import { getIntentPreview, parseInput } from "@/lib/assistant/parse"
import { subscriptionCatalog } from "@/lib/subscriptionCatalog"
import { createSubscription } from "@/lib/subscriptions/createSubscription"
import { enqueueSyncJobs } from "@/lib/sync/enqueueSyncJobs"
import { toCents } from "@/lib/toCents"

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

function extractErrorMessage(err: unknown): string {
  if (!err) return ""
  if (typeof err === "string") return err
  if (err instanceof Error) return err.message ?? ""
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === "string") return msg
  }
  return ""
}

function extractErrorDetails(err: unknown): Record<string, unknown> | null {
  if (!err || typeof err !== "object") return null
  const anyErr = err as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of ["name", "code", "details", "hint", "message"]) {
    if (k in anyErr) out[k] = anyErr[k]
  }
  return Object.keys(out).length ? out : null
}

function normalizePriceCents(input: unknown): number {
  if (typeof input === "number") {
    // If a float slips through (e.g. 14.99), interpret as dollars.
    if (!Number.isFinite(input)) throw new Error("Invalid price. Try: 14.99")
    if (Number.isInteger(input)) return input
    return toCents(input)
  }
  if (typeof input === "string") return toCents(input)
  throw new Error("Invalid price. Try: 14.99")
}

function toUserSafeAssistantError(raw: string): string {
  const msg = raw.trim()
  const lower = msg.toLowerCase()

  // Keep assistant errors user-safe and actionable (the UI will show these verbatim).
  if (!msg) return "Something went wrong. Please try again."
  if (lower.includes("invalid price")) return "Invalid price. Try: 14.99"
  if (lower.includes("price must be greater than 0")) return "Invalid price. Try: 14.99"
  if (lower.includes("invalid input syntax") && lower.includes("integer")) return "Invalid price. Try: 14.99"
  if (lower.includes("period") && (lower.includes("check constraint") || lower.includes("violates"))) {
    return "Invalid period. Use monthly or yearly."
  }
  if (lower.includes("row level security") || lower.includes("rls") || lower.includes("permission denied")) {
    return "You don’t have access to do that."
  }

  return msg
}

function pickDefaultPlanForService(service: string): string | null {
  const key = service.trim().toLowerCase()
  if (!key) return null
  const entry = subscriptionCatalog.find((s) => s.name.trim().toLowerCase() === key)
  if (!entry) return null
  if (entry.defaultPlanName && entry.defaultPlanName.trim()) return entry.defaultPlanName.trim()
  const first = entry.plans?.[0]?.name
  return typeof first === "string" && first.trim() ? first.trim() : null
}

export async function POST(req: NextRequest) {
  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseAnonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json<AssistantResponse>({ kind: "error", message: "Not authenticated" }, { status: 401 })
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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) console.error("[assistant] auth.getUser error", authError)
  if (!user) {
    return NextResponse.json<AssistantResponse>({ kind: "error", message: "Not authenticated" }, { status: 401 })
  }
  const userId = user.id

  const claimedUserId = typeof body.userId === "string" ? body.userId.trim() : ""
  if (claimedUserId && claimedUserId !== userId) {
    return NextResponse.json<AssistantResponse>({ kind: "error", message: "Not authenticated" }, { status: 401 })
  }

  const { parsed, error: parseError } = parseInput(text)
  const preview = getIntentPreview(parsed)

  async function logEvent(status: "ok" | "error", error?: string) {
    try {
      // Never attempt to insert without a user_id; RLS expects auth.uid() = user_id.
      if (!userId) throw new Error("Not authenticated")
      const { error: insertError } = await supabase.from("assistant_events").insert({
        user_id: userId,
        input_text: text,
        parsed,
        status,
        error: error ?? null,
      })
      if (insertError) console.error("[assistant] assistant_events insert error", insertError)
    } catch (err) {
      console.error("[assistant] logEvent failed", err)
    }
  }

  async function logActivity(kind: "action" | "query" | "error", result: Record<string, unknown>) {
    try {
      // Never attempt to insert without a user_id; RLS expects auth.uid() = user_id.
      if (!userId) throw new Error("Not authenticated")
      const { error: insertError } = await supabase.from("assistant_activity").insert({
        user_id: userId,
        kind,
        command: text,
        result,
      })
      if (insertError) console.error("[assistant] assistant_activity insert error", insertError)
    } catch (err) {
      // best-effort; never block the assistant, but do log server-side details
      console.error("[assistant] logActivity failed", err)
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

      if (error) {
        console.error("[assistant] subscriptions select error (spending)", error)
        throw new Error(error.message)
      }
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

      if (error) {
        console.error("[assistant] subscriptions select error (upcoming_renewals)", error)
        throw new Error(error.message)
      }
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
      const args = parsed.args as Partial<AddSubscriptionArgs> & Record<string, unknown>
      const service = typeof args?.service === "string" ? args.service.trim() : ""
      if (!service) {
        const msg = "Missing service name."
        await logEvent("error", msg)
        return NextResponse.json<AssistantResponse>({ kind: "error", message: msg }, { status: 400 })
      }

      let priceCents: number
      try {
        // Prefer the parser’s `priceCents` (expected int), but accept a raw `price` too.
        const raw = (args as { priceCents?: unknown; price?: unknown }).priceCents ?? (args as { price?: unknown }).price
        priceCents = normalizePriceCents(raw)
      } catch (err: unknown) {
        const msg = extractErrorMessage(err) || "Missing or invalid price. Try: 14.99"
        await logEvent("error", msg)
        return NextResponse.json<AssistantResponse>({ kind: "error", message: msg }, { status: 400 })
      }

      const period: Period = args?.period === "yearly" || args?.period === "monthly" ? args.period : "monthly"
      const category = typeof args?.category === "string" && args.category.trim() ? args.category.trim() : "Other"
      const reminderDays = typeof args?.remindDays === "number" && args.remindDays > 0 ? Math.floor(args.remindDays) : null
      const renewalDate = typeof args?.renewDate === "string" ? toIsoDateOnly(args.renewDate) : null
      const parsedPlan = typeof args?.plan === "string" ? args.plan.trim() : ""
      const fallbackPlan = pickDefaultPlanForService(service) ?? "Standard"
      const finalPlan = (parsedPlan || fallbackPlan).trim()
      if (!finalPlan) {
        const msg = "Plan is required."
        await logEvent("error", msg)
        return NextResponse.json<AssistantResponse>({ kind: "error", message: msg }, { status: 400 })
      }

      // NOTE: some deployments enforce `subscriptions.plan NOT NULL`.
      // Always send a non-null, non-empty plan string.
      const payloadForInsert = { service, plan: finalPlan, priceCents, period, category, reminderDays, renewalDate }
      let created: Awaited<ReturnType<typeof createSubscription>>
      try {
        created = await createSubscription(payloadForInsert, { accessToken: token })
      } catch (err: unknown) {
        const rawMsg = extractErrorMessage(err) || "Couldn’t create subscription."
        const msg = toUserSafeAssistantError(rawMsg)
        console.error("[assistant] add_subscription failed", {
          userId,
          payload: payloadForInsert,
          error: extractErrorDetails(err) ?? rawMsg,
        })
        await logEvent("error", msg)
        await logActivity("error", { message: msg, parsed, preview })
        return NextResponse.json<AssistantResponse>({ kind: "error", message: msg, parsed, preview }, { status: 400 })
      }
      const sync = await enqueueSyncJobs(supabase, { userId, action: "push_subscription", payload: { record_id: created.id } })
      await logEvent("ok")
      const planLabel = created.plan ? ` (${created.plan})` : ""
      const per = created.period === "yearly" ? "/yr" : "/mo"
      const pretty = `Added ${created.service}${planLabel} $${(created.price_cents / 100).toFixed(2)}${per}`
      await logActivity("action", { message: pretty, data: created ?? null, sync })
      return NextResponse.json<AssistantResponse>({
        kind: "action",
        message: pretty,
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

      if (error) {
        console.error("[assistant] tasks insert error", error)
        throw new Error(error.message)
      }
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

      if (error) {
        console.error("[assistant] plans insert error", error)
        throw new Error(error.message)
      }
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
    console.error("[assistant] command handling error", err)
    const message = extractErrorMessage(err) || "Unexpected error"
    await logEvent("error", message)
    await logActivity("error", { message, parsed, preview })
    return NextResponse.json<AssistantResponse>({ kind: "error", message, parsed, preview }, { status: 500 })
  }
}

