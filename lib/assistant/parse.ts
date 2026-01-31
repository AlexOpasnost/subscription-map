import { toCents } from "@/lib/toCents"

export type Period = "monthly" | "yearly"

export type AssistantEventParsed =
  | { kind: "action"; action: "add_subscription"; args: unknown }
  | { kind: "action"; action: "add_task"; args: unknown }
  | { kind: "action"; action: "add_birthday"; args: unknown }
  | { kind: "action"; action: "add_reminder"; args: unknown }
  | { kind: "action"; action: "add_plan"; args: unknown }
  | { kind: "query"; query: "spending"; args: unknown }
  | { kind: "query"; query: "upcoming_renewals"; args: unknown }
  | { kind: "query"; query: "timeline"; args: unknown }
  | { kind: "unknown"; args: unknown }

export type AddSubscriptionArgs = {
  service: string
  priceCents: number
  period: Period
  plan?: string
  category?: string
  renewDate?: string // YYYY-MM-DD
  remindDays?: number
}

export type AddTaskArgs = {
  title: string
  dueAt?: string // ISO
  category?: string
  amountCents?: number
  currency?: string
}

export type AddBirthdayArgs = {
  name: string
  birthDate?: string // YYYY-MM-DD
  remindOffsetDays?: number
}

export type ReminderRuleType = "absolute" | "offset_before" | "recurring"
export type ReminderTargetType = "subscription" | "task" | "person" | "custom"

export type AddReminderArgs = {
  title: string
  targetType: ReminderTargetType
  targetName?: string
  targetId?: string
  ruleType: ReminderRuleType
  remindAt?: string // ISO
  offsetDays?: number
  anchorField?: string
  rrule?: string
  channel?: string
}

export type QueryTimelineArgs = { days?: number }

export type AddPlanArgs = {
  title: string
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
  budgetCents?: number
}

export type AssistantPreview =
  | { kind: "action"; title: string; summary: string; details: Record<string, unknown> }
  | { kind: "query"; title: string; summary: string }
  | { kind: "unknown"; title: string; summary: string }

function parseCurrencyToCents(input: string): number | null {
  try {
    return toCents(input)
  } catch {
    return null
  }
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

function isoFromDateOnly(dateOnly: string): string | null {
  const d = toIsoDateOnly(dateOnly)
  if (!d) return null
  const dt = new Date(`${d}T09:00:00.000Z`)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function parseDayOfMonthFromText(text: string): number | null {
  const m = /\b(?:on\s+the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n < 1 || n > 31) return null
  return n
}

function toIsoDateOnlyFromDayOfMonth(day: number, now = new Date()): string | null {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() // 0-based
  const today = now.getUTCDate()
  const month = today <= day ? m : m + 1
  const dt = new Date(Date.UTC(y, month, day, 0, 0, 0))
  if (Number.isNaN(dt.getTime())) return null
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
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

export function parseInput(text: string): { parsed: AssistantEventParsed; error?: string } {
  const raw = text.trim()
  const lower = raw.toLowerCase()
  if (!raw) return { parsed: { kind: "unknown", args: {} }, error: "Empty input." }

  // Queries
  if (lower.includes("what am i spending")) {
    return { parsed: { kind: "query", query: "spending", args: {} } }
  }
  if (lower.includes("what's due this week") || lower.includes("whats due this week") || lower.includes("due this week")) {
    return { parsed: { kind: "query", query: "timeline", args: { days: 7 } as QueryTimelineArgs } }
  }
  if (lower.includes("timeline") || lower.includes("what's coming up") || lower.includes("whats coming up")) {
    const m = /\b(\d{1,3})\s*days?\b/i.exec(raw)
    const days = m ? Number(m[1]) : undefined
    return { parsed: { kind: "query", query: "timeline", args: { days: Number.isFinite(days) ? days : undefined } as QueryTimelineArgs } }
  }
  if (lower.includes("upcoming renewals")) {
    return { parsed: { kind: "query", query: "upcoming_renewals", args: { windowDays: 30 } } }
  }

  // Actions
  if (lower.startsWith("add subscription ")) {
    const rest = raw.slice("add subscription ".length).trim()
    const tokens = tokenize(rest)
    const keywords = new Set(["plan", "category", "renew", "remind", "price", "period"])

    const hasKeywordStyle = tokens.some((t) => {
      const v = t.toLowerCase()
      return v === "price" || v === "period" || v === "plan" || v === "category"
    })

    let service = ""
    let priceCents: number | null = null
    let period: Period = "monthly"
    const args: AddSubscriptionArgs = { service: "", priceCents: 0, period }

    const firstKeywordIdx = tokens.findIndex((t) => keywords.has(t.toLowerCase()))

    if (hasKeywordStyle && firstKeywordIdx > 0) {
      // Keyword-driven format, e.g.:
      // add subscription Netflix plan Standard price 15.49 period monthly category Entertainment
      service = tokens.slice(0, firstKeywordIdx).join(" ").trim()
      let i = firstKeywordIdx
      while (i < tokens.length) {
        const key = tokens[i]?.toLowerCase()
        if (!key || !keywords.has(key)) {
          i++
          continue
        }

        if (key === "price") {
          const cents = parseCurrencyToCents(tokens[i + 1] ?? "")
          if (cents !== null) priceCents = cents
          i = i + 2
          continue
        }

        if (key === "period") {
          const v = (tokens[i + 1] ?? "").toLowerCase()
          if (v === "monthly" || v === "yearly") period = v as Period
          i = i + 2
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
    } else {
      // Positional format, e.g.: add subscription Spotify 10.99 monthly
      const priceIdx = tokens.findIndex((t) => parseCurrencyToCents(t) !== null)
      if (priceIdx < 0) {
        return { parsed: { kind: "action", action: "add_subscription", args: {} }, error: "Missing price (e.g. 12.99)." }
      }

      service = tokens.slice(0, priceIdx).join(" ").trim()
      priceCents = parseCurrencyToCents(tokens[priceIdx] ?? "")
      const maybePeriod = (tokens[priceIdx + 1] ?? "").toLowerCase()
      if (maybePeriod === "monthly" || maybePeriod === "yearly") {
        period = maybePeriod as Period
      }

      // Parse optional keyword segments after price / optional period.
      let i = priceIdx + 1 + (maybePeriod === "monthly" || maybePeriod === "yearly" ? 1 : 0)
      while (i < tokens.length) {
        const key = tokens[i]?.toLowerCase()
        if (!key || !keywords.has(key)) {
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
        if (key === "period") {
          const v = (tokens[i + 1] ?? "").toLowerCase()
          if (v === "monthly" || v === "yearly") period = v as Period
          i = i + 2
          continue
        }
        if (key === "price") {
          const cents = parseCurrencyToCents(tokens[i + 1] ?? "")
          if (cents !== null) priceCents = cents
          i = i + 2
          continue
        }
        i++
      }
    }

    if (!service) return { parsed: { kind: "action", action: "add_subscription", args: {} }, error: "Missing service name." }
    if (!priceCents) return { parsed: { kind: "action", action: "add_subscription", args: {} }, error: "Missing or invalid price." }

    args.service = service
    args.priceCents = priceCents
    args.period = period
    return { parsed: { kind: "action", action: "add_subscription", args } }
  }

  if (lower.startsWith("add task ")) {
    const rest = raw.slice("add task ".length).trim()
    const tokens = tokenize(rest)
    const keywords = new Set(["due", "amount", "category", "currency"])
    const firstKeywordIdx = tokens.findIndex((t) => keywords.has(t.toLowerCase()))
    const title = (firstKeywordIdx >= 0 ? tokens.slice(0, firstKeywordIdx) : tokens).join(" ").trim()
    if (!title) return { parsed: { kind: "action", action: "add_task", args: {} }, error: "Missing task title." }
    const args: AddTaskArgs = { title }

    // lightweight category inference
    if (/\btax\b/i.test(title)) args.category = "tax"
    else if (/\bbill\b/i.test(title) || /\bpayment\b/i.test(title)) args.category = "bill"

    let i = firstKeywordIdx >= 0 ? firstKeywordIdx : tokens.length
    while (i < tokens.length) {
      const key = tokens[i]?.toLowerCase()
      if (!key || !keywords.has(key)) {
        i++
        continue
      }
      if (key === "due") {
        const { value, nextIdx } = sliceUntilKeyword(tokens, i + 1, keywords)
        // Prefer date-only (YYYY-MM-DD) but accept ISO-ish.
        const dateOnly = toIsoDateOnly(value)
        const iso = dateOnly ? isoFromDateOnly(dateOnly) : parseMaybeIsoDateTime(value)
        if (iso) args.dueAt = iso
        i = nextIdx
        continue
      }
      if (key === "amount") {
        const cents = parseCurrencyToCents(tokens[i + 1] ?? "")
        if (cents !== null) args.amountCents = cents
        i = i + 2
        continue
      }
      if (key === "currency") {
        const cur = String(tokens[i + 1] ?? "").trim().toUpperCase()
        if (cur) args.currency = cur.slice(0, 8)
        i = i + 2
        continue
      }
      if (key === "category") {
        const { value, nextIdx } = sliceUntilKeyword(tokens, i + 1, keywords)
        if (value) args.category = value.toLowerCase().slice(0, 30)
        i = nextIdx
        continue
      }
      i++
    }
    return { parsed: { kind: "action", action: "add_task", args } }
  }

  if (lower.startsWith("add birthday ")) {
    const rest = raw.slice("add birthday ".length).trim()
    const tokens = tokenize(rest)
    const keywords = new Set(["remind"])
    const firstKeywordIdx = tokens.findIndex((t) => keywords.has(t.toLowerCase()))
    const before = firstKeywordIdx >= 0 ? tokens.slice(0, firstKeywordIdx) : tokens

    // Find birth date (YYYY-MM-DD) if present.
    const dateIdx = before.findIndex((t) => toIsoDateOnly(t) !== null)
    const name = (dateIdx >= 0 ? before.slice(0, dateIdx) : before).join(" ").trim()
    const birthDate = dateIdx >= 0 ? toIsoDateOnly(before[dateIdx] ?? "") : null

    if (!name) return { parsed: { kind: "action", action: "add_birthday", args: {} }, error: "Missing name." }
    const args: AddBirthdayArgs = { name }
    if (birthDate) args.birthDate = birthDate

    // "remind 7 days before"
    const remindIdx = tokens.findIndex((t) => t.toLowerCase() === "remind")
    if (remindIdx >= 0) {
      const n = Number(tokens[remindIdx + 1])
      if (Number.isFinite(n) && n > 0) args.remindOffsetDays = Math.floor(n)
    }
    return { parsed: { kind: "action", action: "add_birthday", args } }
  }

  if (lower.startsWith("remind me to ")) {
    const rest = raw.slice("remind me to ".length).trim()
    if (!rest) return { parsed: { kind: "action", action: "add_reminder", args: {} }, error: "Missing reminder title." }

    // Patterns:
    // - "cancel Netflix on the 21st"
    // - "cancel Netflix on 2026-02-21"
    // - "cancel Netflix 3 days before renewal"
    const isoDateOnly = toIsoDateOnly(rest)
    const dateOnlyMatch = /\b(\d{4}-\d{2}-\d{2})\b/.exec(rest)
    const explicitDateOnly = dateOnlyMatch ? toIsoDateOnly(dateOnlyMatch[1]) : null

    const beforeMatch = /\b(\d{1,3})\s+days?\s+before\b/i.exec(rest)
    if (beforeMatch) {
      const offsetDays = Number(beforeMatch[1])
      const targetNameMatch = /\b(cancel|review)\s+(.+?)\s+\d{1,3}\s+days?\s+before\b/i.exec(rest)
      const targetName = targetNameMatch ? targetNameMatch[2].trim() : undefined
      const isSubscription = /\brenewal\b/i.test(rest) || /\bcancel\b/i.test(rest)
      const args: AddReminderArgs = {
        title: rest,
        targetType: isSubscription ? "subscription" : "custom",
        targetName,
        ruleType: "offset_before",
        offsetDays: Number.isFinite(offsetDays) ? Math.floor(offsetDays) : 3,
        anchorField: isSubscription ? "renewal_date" : undefined,
        channel: "in_app",
      }
      return { parsed: { kind: "action", action: "add_reminder", args } }
    }

    const day = parseDayOfMonthFromText(rest)
    const dateOnly = explicitDateOnly ?? (day ? toIsoDateOnlyFromDayOfMonth(day) : null)
    const remindAt = dateOnly ? isoFromDateOnly(dateOnly) : null
    const targetNameMatch = /\b(cancel|review)\s+(.+?)(?:\s+on\b|\s+on\s+the\b|\s+\d{1,2}(?:st|nd|rd|th)?\b|$)/i.exec(rest)
    const targetName = targetNameMatch ? targetNameMatch[2].trim() : undefined
    const isSubscription = /\bcancel\b/i.test(rest) && !!targetName

    const args: AddReminderArgs = {
      title: rest,
      targetType: isSubscription ? "subscription" : "custom",
      targetName,
      ruleType: "absolute",
      remindAt: remindAt ?? undefined,
      channel: "in_app",
    }

    if (!args.remindAt) {
      return {
        parsed: { kind: "action", action: "add_reminder", args },
        error: "Missing date. Try: “Remind me to … on 2026-04-30” or “on the 21st”.",
      }
    }
    return { parsed: { kind: "action", action: "add_reminder", args } }
  }

  if (lower.startsWith("add plan ")) {
    const rest = raw.slice("add plan ".length).trim()
    const tokens = tokenize(rest)
    // Supported:
    // - add plan <title> from YYYY-MM-DD to YYYY-MM-DD
    // - add plan <title> by YYYY-MM-DD
    const keywords = new Set(["from", "to", "by", "budget"])

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
      if (key === "by") {
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

  return {
    parsed: { kind: "unknown", args: { text: raw } },
    error:
      "Unsupported command. Try: add subscription…, add task…, add birthday…, remind me to…, what am i spending, what's due this week, timeline.",
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export function getIntentPreview(parsed: AssistantEventParsed): AssistantPreview {
  if (parsed.kind === "query" && "query" in parsed && parsed.query === "spending") {
    return { kind: "query", title: "Spending", summary: "Calculate monthly and yearly totals for active subscriptions." }
  }
  if (parsed.kind === "query" && "query" in parsed && parsed.query === "upcoming_renewals") {
    return { kind: "query", title: "Upcoming renewals", summary: "List upcoming renewals in the next 30 days." }
  }
  if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_task") {
    const args = (isRecord(parsed.args) ? parsed.args : {}) as Record<string, unknown>
    const title = typeof args.title === "string" ? args.title : "Task"
    const dueAt = typeof args.dueAt === "string" ? args.dueAt : null
    const category = typeof args.category === "string" ? args.category : null
    const amountCents = typeof args.amountCents === "number" ? args.amountCents : null
    return {
      kind: "action",
      title: "Add task",
      summary: dueAt ? `Create task “${title}” due ${dueAt}.` : `Create task “${title}”.`,
      details: { title, dueAt, category, amountCents },
    }
  }
  if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_birthday") {
    const args = (isRecord(parsed.args) ? parsed.args : {}) as Record<string, unknown>
    const name = typeof args.name === "string" ? args.name : "Person"
    const birthDate = typeof args.birthDate === "string" ? args.birthDate : null
    const remindOffsetDays = typeof args.remindOffsetDays === "number" ? args.remindOffsetDays : null
    return {
      kind: "action",
      title: "Add birthday",
      summary: birthDate ? `Add birthday for ${name} (${birthDate}).` : `Add birthday for ${name}.`,
      details: { name, birthDate, remindOffsetDays },
    }
  }
  if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_reminder") {
    const args = (isRecord(parsed.args) ? parsed.args : {}) as Record<string, unknown>
    const title = typeof args.title === "string" ? args.title : "Reminder"
    const ruleType = typeof args.ruleType === "string" ? args.ruleType : null
    const remindAt = typeof args.remindAt === "string" ? args.remindAt : null
    const offsetDays = typeof args.offsetDays === "number" ? args.offsetDays : null
    const targetType = typeof args.targetType === "string" ? args.targetType : null
    const targetName = typeof args.targetName === "string" ? args.targetName : null
    const summary =
      ruleType === "offset_before"
        ? `Create reminder “${title}” ${offsetDays ?? "N"} days before ${targetType ?? "target"}${targetName ? ` (${targetName})` : ""}.`
        : `Create reminder “${title}” at ${remindAt ?? "a date"}.`
    return {
      kind: "action",
      title: "Add reminder",
      summary,
      details: { title, ruleType, remindAt, offsetDays, targetType, targetName },
    }
  }
  if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_plan") {
    const args = (isRecord(parsed.args) ? parsed.args : {}) as Record<string, unknown>
    const title = typeof args.title === "string" ? args.title : "Plan"
    const startDate = typeof args.startDate === "string" ? args.startDate : null
    const endDate = typeof args.endDate === "string" ? args.endDate : null
    return {
      kind: "action",
      title: "Add plan",
      summary: endDate ? `Create plan “${title}” by ${endDate}.` : `Create plan “${title}”.`,
      details: { title, startDate, endDate },
    }
  }
  if (parsed.kind === "action" && "action" in parsed && parsed.action === "add_subscription") {
    const args = (isRecord(parsed.args) ? parsed.args : {}) as Record<string, unknown>
    const service = typeof args.service === "string" ? args.service : "Subscription"
    const priceCents = typeof args.priceCents === "number" ? args.priceCents : null
    const period = args.period === "monthly" || args.period === "yearly" ? args.period : null
    const price = typeof priceCents === "number" ? `$${(priceCents / 100).toFixed(2)}` : "—"
    const summary = period ? `Add ${service} at ${price} ${period}.` : `Add ${service}.`
    return {
      kind: "action",
      title: "Add subscription",
      summary,
      details: { service, priceCents, period },
    }
  }

  return { kind: "unknown", title: "Unsupported command", summary: "Try: add subscription…, add task…, add plan…, what am i spending, upcoming renewals." }
}

