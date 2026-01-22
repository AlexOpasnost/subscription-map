import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

type Period = "monthly" | "yearly"

type AssistantOkResponse = {
  kind: "action" | "query"
  message: string
  data?: unknown
}

type AssistantErrorResponse = {
  kind: "error"
  message: string
  details?: unknown
}

type AssistantResponse = AssistantOkResponse | AssistantErrorResponse

type AssistantEventParsed =
  | { kind: "action"; action: "add_subscription"; args: unknown }
  | { kind: "action"; action: "add_task"; args: unknown }
  | { kind: "action"; action: "add_plan"; args: unknown }
  | { kind: "query"; query: "spending"; args: unknown }
  | { kind: "query"; query: "upcoming_renewals"; args: unknown }
  | { kind: "unknown"; args: unknown }

type AddSubscriptionArgs = {
  service: string
  priceCents: number
  period: Period
  plan?: string
  category?: string
  renewDate?: string // YYYY-MM-DD
  remindDays?: number
}

type AddTaskArgs = {
  title: string
  dueAt?: string // ISO
}

type AddPlanArgs = {
  title: string
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
  budgetCents?: number
}

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`)
  return v
}

function parseCurrencyToCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, "")
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  if (n <= 0) return null
  return Math.round(n * 100)
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

function sliceUntilKeyword(tokens: string[], startIdx: number, keywords: Set<string>): { value: string; nextIdx: number } {
  const parts: string[] = []
  let i = startIdx
  while (i < tokens.length) {
    const t = tokens[i]
    if (keywords.has(t.toLowerCase())) break
    parts.push(t)
    i++
  }
  return { value: parts.join(" ").trim(), nextIdx: i }
}

function tokenize(input: string): string[] {
  return input
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function parseInput(text: string): { parsed: AssistantEventParsed; error?: string } {
  const raw = text.trim()
  const lower = raw.toLowerCase()
  if (!raw) return { parsed: { kind: "unknown", args: {} }, error: "Empty input." }

  // Queries
  if (lower.includes("what am i spending")) {
    return { parsed: { kind: "query", query: "spending", args: {} } }
  }
  if (lower.includes("upcoming renewals")) {
    return { parsed: { kind: "query", query: "upcoming_renewals", args: { windowDays: 30 } } }
  }

  // Actions
  if (lower.startsWith("add subscription ")) {
    const rest = raw.slice("add subscription ".length).trim()
    const tokens = tokenize(rest)
    const keywords = new Set(["plan", "category", "renew", "remind"])

    const periodIdx = tokens.findIndex((t) => {
      const v = t.toLowerCase()
      return v === "monthly" || v === "yearly"
    })
    if (periodIdx < 0) {
      return { parsed: { kind: "action", action: "add_subscription", args: {} }, error: "Missing billing period (monthly|yearly)." }
    }

    const priceIdx = tokens.findIndex((t) => parseCurrencyToCents(t) !== null)
    if (priceIdx < 0) {
      return { parsed: { kind: "action", action: "add_subscription", args: {} }, error: "Missing price (e.g. 12.99)." }
    }
    if (priceIdx >= periodIdx) {
      return { parsed: { kind: "action", action: "add_subscription", args: {} }, error: "Expected: add subscription <service> <price> <monthly|yearly> ..." }
    }

    const service = tokens.slice(0, priceIdx).join(" ").trim()
    const priceCents = parseCurrencyToCents(tokens[priceIdx] ?? "")
    const periodToken = (tokens[periodIdx] ?? "").toLowerCase() as Period
    if (!service) return { parsed: { kind: "action", action: "add_subscription", args: {} }, error: "Missing service name." }
    if (!priceCents) return { parsed: { kind: "action", action: "add_subscription", args: {} }, error: "Invalid price." }
    if (periodToken !== "monthly" && periodToken !== "yearly") {
      return { parsed: { kind: "action", action: "add_subscription", args: {} }, error: "Invalid period (monthly|yearly)." }
    }

    const args: AddSubscriptionArgs = { service, priceCents, period: periodToken }

    let i = periodIdx + 1
    while (i < tokens.length) {
      const key = tokens[i]?.toLowerCase()
      if (!key) break
      if (!keywords.has(key)) {
        i++
        continue
      }
      if (key === "plan") {
        const { value, nextIdx } = sliceUntilKeyword(tokens, i + 1, keywords)
        if (value) args.plan = value
        i = nextIdx
        continue
      }
      if (key === "category") {
        const { value, nextIdx } = sliceUntilKeyword(tokens, i + 1, keywords)
        if (value) args.category = value
        i = nextIdx
        continue
      }
      if (key === "renew") {
        const { value, nextIdx } = sliceUntilKeyword(tokens, i + 1, keywords)
        const d = toIsoDateOnly(value)
        if (d) args.renewDate = d
        i = nextIdx
        continue
      }
      if (key === "remind") {
        const n = Number(tokens[i + 1])
        if (Number.isFinite(n) && n > 0) args.remindDays = Math.floor(n)
        i = i + 2
        continue
      }
      i++
    }

    return { parsed: { kind: "action", action: "add_subscription", args } }
  }

  if (lower.startsWith("add task ")) {
    const rest = raw.slice("add task ".length).trim()
    const tokens = tokenize(rest)
    const dueIdx = tokens.findIndex((t) => t.toLowerCase() === "due")
    const titleTokens = dueIdx >= 0 ? tokens.slice(0, dueIdx) : tokens
    const title = titleTokens.join(" ").trim()
    if (!title) return { parsed: { kind: "action", action: "add_task", args: {} }, error: "Missing task title." }
    const args: AddTaskArgs = { title }
    if (dueIdx >= 0) {
      const dueText = tokens.slice(dueIdx + 1).join(" ").trim()
      const iso = parseMaybeIsoDateTime(dueText)
      if (iso) args.dueAt = iso
    }
    return { parsed: { kind: "action", action: "add_task", args } }
  }

  if (lower.startsWith("add plan ")) {
    const rest = raw.slice("add plan ".length).trim()
    const tokens = tokenize(rest)
    const keywords = new Set(["from", "to", "budget"])

    const firstKeywordIdx = tokens.findIndex((t) => keywords.has(t.toLowerCase()))
    const title = (firstKeywordIdx >= 0 ? tokens.slice(0, firstKeywordIdx) : tokens).join(" ").trim()
    if (!title) return { parsed: { kind: "action", action: "add_plan", args: {} }, error: "Missing plan title." }
    const args: AddPlanArgs = { title }

    let i = firstKeywordIdx >= 0 ? firstKeywordIdx : tokens.length
    while (i < tokens.length) {
      const key = tokens[i]?.toLowerCase()
      if (!key || !keywords.has(key)) {
        i++
        continue
      }
      if (key === "from") {
        const { value, nextIdx } = sliceUntilKeyword(tokens, i + 1, keywords)
        const d = toIsoDateOnly(value)
        if (d) args.startDate = d
        i = nextIdx
        continue
      }
      if (key === "to") {
        const { value, nextIdx } = sliceUntilKeyword(tokens, i + 1, keywords)
        const d = toIsoDateOnly(value)
        if (d) args.endDate = d
        i = nextIdx
        continue
      }
      if (key === "budget") {
        const amount = tokens[i + 1] ?? ""
        const cents = parseCurrencyToCents(amount)
        if (cents !== null) args.budgetCents = cents
        i = i + 2
        continue
      }
      i++
    }

    return { parsed: { kind: "action", action: "add_plan", args } }
  }

  return { parsed: { kind: "unknown", args: { text: raw } }, error: "Unsupported command. Try: add subscription…, add task…, add plan…, what am i spending, upcoming renewals." }
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

  let body: { text?: unknown }
  try {
    body = (await req.json()) as { text?: unknown }
  } catch {
    return NextResponse.json<AssistantResponse>({ kind: "error", message: "Invalid JSON body" }, { status: 400 })
  }

  const text = typeof body.text === "string" ? body.text : ""
  if (!text.trim()) {
    return NextResponse.json<AssistantResponse>({ kind: "error", message: "Missing `text`" }, { status: 400 })
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

  const { parsed, error: parseError } = parseInput(text)

  async function logEvent(status: "ok" | "error", error?: string) {
    await supabase.from("assistant_events").insert({
      user_id: userId,
      input_text: text,
      parsed,
      status,
      error: error ?? null,
    })
  }

  if (parseError) {
    await logEvent("error", parseError)
    return NextResponse.json<AssistantResponse>({ kind: "error", message: parseError, details: parsed }, { status: 400 })
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
      return NextResponse.json<AssistantResponse>({
        kind: "query",
        message: "Here’s what you’re spending.",
        data: { monthly_total: monthlyTotal, yearly_total: yearlyTotal },
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
      return NextResponse.json<AssistantResponse>({
        kind: "query",
        message: "Upcoming renewals in the next 30 days.",
        data: { items: subs ?? [] },
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
      await logEvent("ok")
      return NextResponse.json<AssistantResponse>({
        kind: "action",
        message: `Added subscription: ${created?.service ?? args.service}`,
        data: created ?? null,
      })
    }

    if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_task") {
      const args = parsed.args as AddTaskArgs
      if (!args?.title || typeof args.title !== "string" || !args.title.trim()) {
        const msg = "Missing task title."
        await logEvent("error", msg)
        return NextResponse.json<AssistantResponse>({ kind: "error", message: msg }, { status: 400 })
      }
      const dueAt = typeof args.dueAt === "string" ? parseMaybeIsoDateTime(args.dueAt) : null
      const { data: created, error } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          title: args.title.trim(),
          due_at: dueAt,
          status: "open",
        })
        .select("id,title,due_at,status,created_at")
        .single()

      if (error) throw error
      await logEvent("ok")
      return NextResponse.json<AssistantResponse>({
        kind: "action",
        message: `Added task: ${created?.title ?? args.title}`,
        data: created ?? null,
      })
    }

    if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_plan") {
      const args = parsed.args as AddPlanArgs
      if (!args?.title || typeof args.title !== "string" || !args.title.trim()) {
        const msg = "Missing plan title."
        await logEvent("error", msg)
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
          budget_cents: budgetCents,
        })
        .select("id,title,start_date,end_date,budget_cents,created_at")
        .single()

      if (error) throw error
      await logEvent("ok")
      return NextResponse.json<AssistantResponse>({
        kind: "action",
        message: `Added plan: ${created?.title ?? args.title}`,
        data: created ?? null,
      })
    }

    await logEvent("error", "Unsupported command.")
    return NextResponse.json<AssistantResponse>(
      { kind: "error", message: "Unsupported command.", details: parsed },
      { status: 400 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    await logEvent("error", message)
    return NextResponse.json<AssistantResponse>({ kind: "error", message }, { status: 500 })
  }
}

