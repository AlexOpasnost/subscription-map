import { NextResponse, type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import type {
  AddBirthdayArgs,
  AddPlanArgs,
  AddReminderArgs,
  AddSubscriptionArgs,
  AddTaskArgs,
  Period,
  QueryTimelineArgs,
} from "@/lib/assistant/parse"
import { getIntentPreview, parseInput } from "@/lib/assistant/parse"
import { subscriptionCatalog } from "@/lib/subscriptionCatalog"
import { createSubscription } from "@/lib/subscriptions/createSubscription"
import { enqueueSyncJobs } from "@/lib/sync/enqueueSyncJobs"
import { syncGoogleCalendarEvent } from "@/lib/sync/providers/googleCalendar"
import { toCents } from "@/lib/toCents"

type AssistantStage = "preview" | "executed"
type AssistantOkResponse = {
  ok: true
  stage: AssistantStage
  message: string
  intent: unknown
  preview: unknown
  result?: unknown
  sync?: { enqueued: number }
}
type AssistantErrorResponse = {
  ok: false
  error: string
  stage?: AssistantStage
  intent?: unknown
  preview?: unknown
  details?: unknown
}
type AssistantResponse = AssistantOkResponse | AssistantErrorResponse

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

function isoDateOnlyFromIso(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer()

  const url = new URL(req.url)
  const mode = (url.searchParams.get("mode") ?? "execute").toLowerCase()

  let body: { text?: unknown; command?: unknown; userId?: unknown }
  try {
    body = (await req.json()) as { text?: unknown; command?: unknown; userId?: unknown }
  } catch {
    return NextResponse.json<AssistantResponse>({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const text =
    typeof body.command === "string"
      ? body.command
      : typeof body.text === "string"
        ? body.text
        : ""
  if (!text.trim()) {
    return NextResponse.json<AssistantResponse>({ ok: false, error: "Missing `text`" }, { status: 400 })
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) console.error("[assistant] auth.getUser error", authError)
  if (!user) {
    return NextResponse.json<AssistantResponse>({ ok: false, error: "Not authenticated" }, { status: 401 })
  }
  const userId = user.id

  const claimedUserId = typeof body.userId === "string" ? body.userId.trim() : ""
  if (claimedUserId && claimedUserId !== userId) {
    return NextResponse.json<AssistantResponse>({ ok: false, error: "Not authenticated" }, { status: 401 })
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

  async function logActivity(
    kind: "action" | "query" | "error" | "preview",
    input: { intent: unknown; status: "ok" | "error"; error?: string | null; result: Record<string, unknown> }
  ) {
    try {
      // Never attempt to insert without a user_id; RLS expects auth.uid() = user_id.
      if (!userId) throw new Error("Not authenticated")
      const { error: insertError } = await supabase.from("assistant_activity").insert({
        user_id: userId,
        kind,
        command: text,
        result: input.result,
        // v2 columns (added via migration 007; nullable for back-compat)
        input_text: text,
        intent: input.intent,
        status: input.status,
        error: input.error ?? null,
      })
      if (insertError) console.error("[assistant] assistant_activity insert error", insertError)
    } catch (err) {
      // best-effort; never block the assistant, but do log server-side details
      console.error("[assistant] logActivity failed", err)
    }
  }

  if (parseError) {
    await logEvent("error", parseError)
    await logActivity("error", { intent: parsed, status: "error", error: parseError, result: { stage: "parse_error", preview } })
    return NextResponse.json<AssistantResponse>({ ok: false, error: parseError, intent: parsed, preview }, { status: 400 })
  }

  try {
    if (mode === "preview") {
      await logEvent("ok")
      await logActivity("preview", { intent: parsed, status: "ok", result: { stage: "preview", preview } })
      return NextResponse.json<AssistantResponse>({
        ok: true,
        stage: "preview",
        message: "Preview ready.",
        intent: parsed,
        preview,
      })
    }

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

      const result = { monthly_total: monthlyTotal, yearly_total: yearlyTotal }
      const message = "Here’s what you’re spending."
      await logEvent("ok")
      await logActivity("query", { intent: parsed, status: "ok", result: { stage: "executed", message, result } })
      return NextResponse.json<AssistantResponse>({
        ok: true,
        stage: "executed",
        message,
        intent: parsed,
        preview,
        result,
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
      const result = { items: subs ?? [] }
      const message = "Upcoming renewals in the next 30 days."
      await logEvent("ok")
      await logActivity("query", { intent: parsed, status: "ok", result: { stage: "executed", message, result } })
      return NextResponse.json<AssistantResponse>({
        ok: true,
        stage: "executed",
        message,
        intent: parsed,
        preview,
        result,
      })
    }

    if (parsed.kind === "query" && "query" in parsed && parsed.query === "timeline") {
      const args = parsed.args as QueryTimelineArgs
      const days = typeof args?.days === "number" && Number.isFinite(args.days) && args.days > 0 ? Math.floor(args.days) : 30
      // Timeline is served by /api/timeline; for now return a redirect hint.
      const message = `Open your timeline (next ${days} days).`
      const result = { days, href: "/app/timeline" }
      await logEvent("ok")
      await logActivity("query", { intent: parsed, status: "ok", result: { stage: "executed", message, result } })
      return NextResponse.json<AssistantResponse>({ ok: true, stage: "executed", message, intent: parsed, preview, result })
    }

    if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_subscription") {
      const args = parsed.args as Partial<AddSubscriptionArgs> & Record<string, unknown>
      const service = typeof args?.service === "string" ? args.service.trim() : ""
      if (!service) {
        const msg = "Missing service name."
        await logEvent("error", msg)
        await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "validation_error", preview } })
        return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
      }

      let priceCents: number
      try {
        // Prefer the parser’s `priceCents` (expected int), but accept a raw `price` too.
        const raw = (args as { priceCents?: unknown; price?: unknown }).priceCents ?? (args as { price?: unknown }).price
        priceCents = normalizePriceCents(raw)
      } catch (err: unknown) {
        const msg = extractErrorMessage(err) || "Missing or invalid price. Try: 14.99"
        await logEvent("error", msg)
        await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "validation_error", preview } })
        return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
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
        await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "validation_error", preview } })
        return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
      }

      // NOTE: some deployments enforce `subscriptions.plan NOT NULL`.
      // Always send a non-null, non-empty plan string.
      const payloadForInsert = { service, plan: finalPlan, priceCents, period, category, reminderDays, renewalDate }
      let created: Awaited<ReturnType<typeof createSubscription>>
      try {
        created = await createSubscription(payloadForInsert, { supabase })
      } catch (err: unknown) {
        const rawMsg = extractErrorMessage(err) || "Couldn’t create subscription."
        const msg = toUserSafeAssistantError(rawMsg)
        console.error("[assistant] add_subscription failed", {
          userId,
          payload: payloadForInsert,
          error: extractErrorDetails(err) ?? rawMsg,
        })
        await logEvent("error", msg)
        await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "execute_error", preview } })
        return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
      }
      const sync = await enqueueSyncJobs(supabase, {
        userId,
        action: "upsert",
        targetType: "subscription",
        targetId: created.id,
      })
      await logEvent("ok")
      const planLabel = created.plan ? ` (${created.plan})` : ""
      const per = created.period === "yearly" ? "/yr" : "/mo"
      const message = `Added ${created.service}${planLabel} $${(created.price_cents / 100).toFixed(2)}${per}`
      const result = created ?? null
      await logActivity("action", { intent: parsed, status: "ok", result: { stage: "executed", message, result, sync } })
      return NextResponse.json<AssistantResponse>({
        ok: true,
        stage: "executed",
        message,
        intent: parsed,
        preview,
        result,
        sync,
      })
    }

    if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_task") {
      const args = parsed.args as AddTaskArgs
      if (!args?.title || typeof args.title !== "string" || !args.title.trim()) {
        const msg = "Missing task title."
        await logEvent("error", msg)
        await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "validation_error", preview } })
        return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
      }
      const dueAt = typeof args.dueAt === "string" ? parseMaybeIsoDateTime(args.dueAt) : null
      const dueDate = dueAt ? dueAt.slice(0, 10) : null
      const category = typeof args.category === "string" && args.category.trim() ? args.category.trim().slice(0, 30) : "general"
      const amountCents =
        typeof args.amountCents === "number" && Number.isFinite(args.amountCents) && args.amountCents > 0
          ? Math.floor(args.amountCents)
          : null
      const currency = typeof args.currency === "string" && args.currency.trim() ? args.currency.trim().toUpperCase().slice(0, 8) : "USD"
      const { data: created, error } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          title: args.title.trim(),
          due_at: dueAt,
          due_date: dueDate,
          category,
          amount_cents: amountCents,
          currency,
          status: "open",
        })
        .select("id,title,due_at,due_date,category,amount_cents,currency,status,created_at")
        .single()

      if (error) {
        console.error("[assistant] tasks insert error", error)
        throw new Error(error.message)
      }
      const sync = await enqueueSyncJobs(supabase, { userId, action: "upsert", targetType: "task", targetId: created.id })
      await logEvent("ok")
      const message = `Added task: ${created?.title ?? args.title}`
      const result = created ?? null
      await logActivity("action", { intent: parsed, status: "ok", result: { stage: "executed", message, result, sync } })
      return NextResponse.json<AssistantResponse>({ ok: true, stage: "executed", message, intent: parsed, preview, result, sync })
    }

    if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_birthday") {
      const args = parsed.args as AddBirthdayArgs
      const name = typeof args?.name === "string" ? args.name.trim() : ""
      if (!name) {
        const msg = "Missing name."
        await logEvent("error", msg)
        await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "validation_error", preview } })
        return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
      }
      const birthDate = typeof args.birthDate === "string" ? args.birthDate.trim() : ""
      const safeBirthDate = birthDate ? toIsoDateOnly(birthDate) : null

      const { data: created, error } = await supabase
        .from("people")
        .insert({
          user_id: userId,
          name,
          birth_date: safeBirthDate,
        })
        .select("id,user_id,name,birth_date,created_at")
        .single()

      if (error) {
        console.error("[assistant] people insert error", error)
        throw new Error(error.message)
      }

      // Optional: create an offset reminder for the next birthday occurrence.
      const offsetDays =
        typeof args.remindOffsetDays === "number" && Number.isFinite(args.remindOffsetDays) && args.remindOffsetDays > 0
          ? Math.floor(args.remindOffsetDays)
          : null

      if (offsetDays !== null && safeBirthDate) {
        const now = new Date()
        const [_, mm, dd] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(safeBirthDate) ?? []
        if (mm && dd) {
          const y = now.getUTCFullYear()
          const thisYear = new Date(Date.UTC(y, Number(mm) - 1, Number(dd), 9, 0, 0))
          const next = thisYear.getTime() >= now.getTime() ? thisYear : new Date(Date.UTC(y + 1, Number(mm) - 1, Number(dd), 9, 0, 0))
          const remindAt = new Date(next.getTime() - offsetDays * 24 * 60 * 60 * 1000).toISOString()
          await supabase.from("reminders").insert({
            user_id: userId,
            kind: "birthday",
            target_type: "person",
            target_id: created.id,
            title: `Birthday: ${name}`,
            rule_type: "offset_before",
            offset_days: offsetDays,
            anchor_field: "birth_date",
            remind_at: remindAt,
            channel: "in_app",
          })
        }
      }

      const message = `Added birthday: ${created.name}`
      const result = created ?? null
      await logEvent("ok")
      await logActivity("action", { intent: parsed, status: "ok", result: { stage: "executed", message, result } })
      const sync = await enqueueSyncJobs(supabase, { userId, action: "upsert", targetType: "person", targetId: created.id })
      return NextResponse.json<AssistantResponse>({ ok: true, stage: "executed", message, intent: parsed, preview, result, sync })
    }

    if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_reminder") {
      const args = parsed.args as AddReminderArgs
      const title = typeof args?.title === "string" ? args.title.trim() : ""
      if (!title) {
        const msg = "Missing reminder title."
        await logEvent("error", msg)
        await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "validation_error", preview } })
        return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
      }
      const targetType = args?.targetType === "subscription" || args?.targetType === "task" || args?.targetType === "person" ? args.targetType : "custom"
      const ruleType = args?.ruleType === "offset_before" || args?.ruleType === "recurring" ? args.ruleType : "absolute"
      const channel = typeof args.channel === "string" && args.channel.trim() ? args.channel.trim() : "in_app"
      const targetName = typeof args.targetName === "string" && args.targetName.trim() ? args.targetName.trim() : null

      if (ruleType === "recurring") {
        const msg = "Recurring reminders are coming soon. For now, use an absolute date."
        await logEvent("error", msg)
        await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "validation_error", preview } })
        return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
      }

      let targetId: string | null = typeof args.targetId === "string" && args.targetId.trim() ? args.targetId.trim() : null
      let remindAt: string | null = typeof args.remindAt === "string" ? parseMaybeIsoDateTime(args.remindAt) : null
      let offsetDays: number | null =
        typeof args.offsetDays === "number" && Number.isFinite(args.offsetDays) && args.offsetDays > 0 ? Math.floor(args.offsetDays) : null
      const anchorField = typeof args.anchorField === "string" && args.anchorField.trim() ? args.anchorField.trim() : null

      // For offset_before, compute remind_at from the target's anchor field where possible.
      if (ruleType === "offset_before") {
        if (!offsetDays) offsetDays = 3
        if (targetType === "subscription" && targetName && !targetId) {
          const { data: sub, error } = await supabase
            .from("subscriptions")
            .select("id,renewal_date")
            .ilike("service", targetName)
            .eq("cancelled", false)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          if (error) throw new Error(error.message)
          if (sub?.id) targetId = sub.id
          const renewalDate = typeof sub?.renewal_date === "string" ? sub.renewal_date : null
          if (renewalDate) {
            const dt = new Date(`${renewalDate}T09:00:00.000Z`)
            remindAt = new Date(dt.getTime() - offsetDays * 24 * 60 * 60 * 1000).toISOString()
          }
        }
        if (!remindAt) {
          const msg = "I couldn’t compute the reminder date. Add a date (YYYY-MM-DD) or set the target’s date first."
          await logEvent("error", msg)
          await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "validation_error", preview } })
          return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
        }
      }

      if (!remindAt) {
        const msg = "Missing reminder date. Try: “Remind me to … on 2026-04-30”."
        await logEvent("error", msg)
        await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "validation_error", preview } })
        return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
      }

      const { data: created, error } = await supabase
        .from("reminders")
        .insert({
          user_id: userId,
          kind: "assistant",
          target_type: targetType,
          target_id: targetId,
          title,
          rule_type: ruleType,
          remind_at: remindAt,
          offset_days: offsetDays,
          anchor_field: anchorField,
          channel,
        })
        .select("id,user_id,title,target_type,target_id,rule_type,remind_at,created_at")
        .single()

      if (error) {
        console.error("[assistant] reminders insert error", error)
        throw new Error(error.message)
      }

      const message = "Reminder saved."
      const result = created ?? null
      await logEvent("ok")
      await logActivity("action", { intent: parsed, status: "ok", result: { stage: "executed", message, result } })
      return NextResponse.json<AssistantResponse>({ ok: true, stage: "executed", message, intent: parsed, preview, result })
    }

    if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_plan") {
      const args = parsed.args as AddPlanArgs
      if (!args?.title || typeof args.title !== "string" || !args.title.trim()) {
        const msg = "Missing plan title."
        await logEvent("error", msg)
        await logActivity("error", { intent: parsed, status: "error", error: msg, result: { stage: "validation_error", preview } })
        return NextResponse.json<AssistantResponse>({ ok: false, error: msg, intent: parsed, preview }, { status: 400 })
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

      // Prefer immediate plan sync (idempotent + visible via sync_jobs/sync_logs).
      // Keep API response shape stable (`sync.enqueued`) for existing UI.
      const googleSync = await syncGoogleCalendarEvent({ supabase, userId, planId: created.id })
      const sync = { enqueued: 0 }
      await logEvent("ok")
      const message = `Added plan: ${created?.title ?? args.title}`
      const result = created ? { ...created, googleSync } : null
      await logActivity("action", { intent: parsed, status: "ok", result: { stage: "executed", message, result, sync } })
      return NextResponse.json<AssistantResponse>({ ok: true, stage: "executed", message, intent: parsed, preview, result, sync })
    }

    await logEvent("error", "Unsupported command.")
    await logActivity("error", { intent: parsed, status: "error", error: "Unsupported command.", result: { stage: "validation_error", preview } })
    return NextResponse.json<AssistantResponse>({ ok: false, error: "Unsupported command.", intent: parsed, preview }, { status: 400 })
  } catch (err: unknown) {
    console.error("[assistant] command handling error", err)
    const message = extractErrorMessage(err) || "Something went wrong while processing that."
    await logEvent("error", message)
    await logActivity("error", { intent: parsed, status: "error", error: message, result: { stage: "execute_error", preview } })
    return NextResponse.json<AssistantResponse>({ ok: false, error: toUserSafeAssistantError(message), intent: parsed, preview }, { status: 500 })
  }
}

