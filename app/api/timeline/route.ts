import { NextResponse, type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

type TimelineItem = {
  type: "task" | "subscription" | "birthday" | "reminder"
  title: string
  date: string // ISO timestamp
  meta?: Record<string, unknown>
}

function clampDays(input: string | null): number {
  const n = input ? Number(input) : NaN
  if (!Number.isFinite(n) || n <= 0) return 30
  return Math.max(1, Math.min(365, Math.floor(n)))
}

function nextBirthdayOccurrenceIso(birthDate: string, now = new Date()): string | null {
  // birthDate is YYYY-MM-DD (year may be present but we only care about month/day)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim())
  if (!m) return null
  const mm = Number(m[2])
  const dd = Number(m[3])
  if (!Number.isFinite(mm) || !Number.isFinite(dd)) return null
  const y = now.getUTCFullYear()
  const thisYear = new Date(Date.UTC(y, mm - 1, dd, 9, 0, 0))
  if (Number.isNaN(thisYear.getTime())) return null
  const next = thisYear.getTime() >= now.getTime() ? thisYear : new Date(Date.UTC(y + 1, mm - 1, dd, 9, 0, 0))
  return next.toISOString()
}

function parseRrule(rrule: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of rrule.split(";")) {
    const [k, v] = part.split("=")
    const key = (k ?? "").trim().toUpperCase()
    const val = (v ?? "").trim()
    if (key && val) out[key] = val
  }
  return out
}

function nextRecurringOccurrenceIso(rrule: string, dtStart: Date, after: Date): string | null {
  // Minimal RRULE support (subset): FREQ + INTERVAL (+ BYMONTHDAY).
  // Returns the next occurrence strictly after `after`.
  const parts = parseRrule(rrule)
  const freq = (parts.FREQ ?? "").toUpperCase()
  const intervalRaw = Number(parts.INTERVAL ?? "1")
  const interval = Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.floor(intervalRaw) : 1
  const byMonthDayRaw = parts.BYMONTHDAY ? Number(parts.BYMONTHDAY) : NaN
  const byMonthDay = Number.isFinite(byMonthDayRaw) ? Math.floor(byMonthDayRaw) : null

  const start = new Date(dtStart.getTime())
  if (!Number.isFinite(start.getTime())) return null

  const base = after.getTime() > start.getTime() ? after : start
  const baseDate = new Date(base.getTime())

  const hour = start.getUTCHours()
  const minute = start.getUTCMinutes()
  const second = start.getUTCSeconds()

  function mk(y: number, m0: number, d: number) {
    return new Date(Date.UTC(y, m0, d, hour, minute, second))
  }

  if (freq === "DAILY") {
    const one = 24 * 60 * 60 * 1000
    const diffDays = Math.floor((baseDate.getTime() - start.getTime()) / one)
    const steps = Math.max(0, Math.floor(diffDays / interval))
    let candidate = new Date(start.getTime() + steps * interval * one)
    while (candidate.getTime() <= after.getTime()) candidate = new Date(candidate.getTime() + interval * one)
    return candidate.toISOString()
  }

  if (freq === "WEEKLY") {
    const oneWeek = 7 * 24 * 60 * 60 * 1000
    const diffWeeks = Math.floor((baseDate.getTime() - start.getTime()) / oneWeek)
    const steps = Math.max(0, Math.floor(diffWeeks / interval))
    let candidate = new Date(start.getTime() + steps * interval * oneWeek)
    while (candidate.getTime() <= after.getTime()) candidate = new Date(candidate.getTime() + interval * oneWeek)
    return candidate.toISOString()
  }

  if (freq === "MONTHLY") {
    const sY = start.getUTCFullYear()
    const sM = start.getUTCMonth()
    const targetDay = byMonthDay ?? start.getUTCDate()
    const baseY = baseDate.getUTCFullYear()
    const baseM = baseDate.getUTCMonth()
    const startTotal = sY * 12 + sM
    const baseTotal = baseY * 12 + baseM
    const monthsDiff = Math.max(0, baseTotal - startTotal)
    let steps = Math.floor(monthsDiff / interval)
    for (let i = 0; i < 36; i++) {
      const total = startTotal + steps * interval
      const y = Math.floor(total / 12)
      const m0 = total % 12
      let candidate = mk(y, m0, targetDay)
      // If invalid date (e.g. Feb 30), JS rolls over. Detect and skip.
      if (candidate.getUTCMonth() !== m0) {
        steps++
        continue
      }
      if (candidate.getTime() <= after.getTime()) {
        steps++
        continue
      }
      return candidate.toISOString()
    }
    return null
  }

  if (freq === "YEARLY") {
    const targetDay = byMonthDay ?? start.getUTCDate()
    const targetMonth = start.getUTCMonth()
    let y = Math.max(start.getUTCFullYear(), after.getUTCFullYear())
    // Step in years by interval, starting from dtStart's year.
    const startY = start.getUTCFullYear()
    const diff = Math.max(0, y - startY)
    let steps = Math.floor(diff / interval)
    for (let i = 0; i < 10; i++) {
      const yr = startY + steps * interval
      const candidate = mk(yr, targetMonth, targetDay)
      if (candidate.getUTCMonth() !== targetMonth) {
        steps++
        continue
      }
      if (candidate.getTime() <= after.getTime()) {
        steps++
        continue
      }
      return candidate.toISOString()
    }
    return null
  }

  return null
}

export async function GET(req: NextRequest) {
  const days = clampDays(new URL(req.url).searchParams.get("days"))
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0))
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
  const startDateOnly = start.toISOString().slice(0, 10)
  const endDateOnly = end.toISOString().slice(0, 10)

  const supabase = await supabaseServer()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    if (authError) console.error("[timeline] auth.getUser error", authError)
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })
  }

  // Tasks: include due_at if present; else fall back to due_date at 09:00Z.
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id,title,due_at,due_date,category,amount_cents,currency,status")
    .in("status", ["open"])
    .or(`due_date.gte.${startDateOnly},due_at.gte.${start.toISOString()}`)
    .limit(200)

  if (tasksError) {
    console.error("[timeline] tasks select error", tasksError)
    return NextResponse.json({ ok: false, error: tasksError.message }, { status: 500 })
  }

  const taskItems: TimelineItem[] = (tasks ?? [])
    .map((t: any) => {
      const dueAt = typeof t.due_at === "string" ? new Date(t.due_at) : null
      const dueDate = typeof t.due_date === "string" ? t.due_date : null
      const dateIso =
        dueAt && Number.isFinite(dueAt.getTime())
          ? dueAt.toISOString()
          : dueDate
            ? new Date(`${dueDate}T09:00:00.000Z`).toISOString()
            : null
      if (!dateIso) return null
      if (dateIso < start.toISOString() || dateIso > end.toISOString()) return null
      return {
        type: "task" as const,
        title: String(t.title ?? "Task"),
        date: dateIso,
        meta: {
          id: t.id,
          category: t.category ?? "general",
          amount_cents: t.amount_cents ?? null,
          currency: t.currency ?? "USD",
        },
      }
    })
    .filter(Boolean) as TimelineItem[]

  // Subscriptions: renewal_date (date-only)
  const { data: subs, error: subsError } = await supabase
    .from("subscriptions")
    .select("id,service,renewal_date,price_cents,period,category")
    .eq("cancelled", false)
    .not("renewal_date", "is", null)
    .gte("renewal_date", startDateOnly)
    .lte("renewal_date", endDateOnly)
    .limit(200)

  if (subsError) {
    console.error("[timeline] subscriptions select error", subsError)
    return NextResponse.json({ ok: false, error: subsError.message }, { status: 500 })
  }

  const subItems: TimelineItem[] = (subs ?? []).map((s: any) => ({
    type: "subscription" as const,
    title: String(s.service ?? "Subscription"),
    date: new Date(`${s.renewal_date}T09:00:00.000Z`).toISOString(),
    meta: { id: s.id, price_cents: s.price_cents, period: s.period, category: s.category },
  }))

  // People: birthdays (next occurrence)
  const { data: people, error: peopleError } = await supabase
    .from("people")
    .select("id,name,birth_date")
    .not("birth_date", "is", null)
    .limit(500)

  if (peopleError) {
    console.error("[timeline] people select error", peopleError)
    return NextResponse.json({ ok: false, error: peopleError.message }, { status: 500 })
  }

  const birthdayItems: TimelineItem[] = (people ?? [])
    .map((p: any) => {
      const birthDate = typeof p.birth_date === "string" ? p.birth_date : ""
      const iso = birthDate ? nextBirthdayOccurrenceIso(birthDate, now) : null
      if (!iso) return null
      if (iso < start.toISOString() || iso > end.toISOString()) return null
      return {
        type: "birthday" as const,
        title: `Birthday: ${String(p.name ?? "Someone")}`,
        date: iso,
        meta: { id: p.id, name: p.name, birth_date: p.birth_date },
      }
    })
    .filter(Boolean) as TimelineItem[]

  // Reminders: absolute computed remind_at
  const { data: reminders, error: remindersError } = await supabase
    .from("reminders")
    .select("id,title,remind_at,target_type,target_id,rule_type,offset_days,anchor_field,rrule,channel,created_at")
    .gte("remind_at", start.toISOString())
    .lte("remind_at", end.toISOString())
    .order("remind_at", { ascending: true })
    .limit(500)

  if (remindersError) {
    console.error("[timeline] reminders select error", remindersError)
    return NextResponse.json({ ok: false, error: remindersError.message }, { status: 500 })
  }

  const reminderItems: TimelineItem[] = (reminders ?? []).map((r: any) => ({
    type: "reminder" as const,
    title: String(r.title ?? "Reminder"),
    date: new Date(r.remind_at).toISOString(),
    meta: { id: r.id, target_type: r.target_type, target_id: r.target_id, rule_type: r.rule_type, channel: r.channel },
  }))

  // Reminders that can be computed (remind_at is NULL).
  const { data: reminderRules, error: reminderRulesError } = await supabase
    .from("reminders")
    .select("id,title,remind_at,target_type,target_id,rule_type,offset_days,anchor_field,rrule,channel,created_at")
    .is("remind_at", null)
    .in("rule_type", ["offset_before", "recurring"])
    .limit(500)

  if (reminderRulesError) {
    console.error("[timeline] reminders (rules) select error", reminderRulesError)
    return NextResponse.json({ ok: false, error: reminderRulesError.message }, { status: 500 })
  }

  const offsetRules = (reminderRules ?? []).filter((r: any) => String(r.rule_type ?? "") === "offset_before")
  const recurringRules = (reminderRules ?? []).filter((r: any) => String(r.rule_type ?? "") === "recurring")

  const subTargets = offsetRules.filter((r: any) => r.target_type === "subscription" && r.target_id).map((r: any) => r.target_id as string)
  const taskTargets = offsetRules.filter((r: any) => r.target_type === "task" && r.target_id).map((r: any) => r.target_id as string)
  const personTargets = offsetRules.filter((r: any) => r.target_type === "person" && r.target_id).map((r: any) => r.target_id as string)

  const [subsTargetsRes, tasksTargetsRes, peopleTargetsRes] = await Promise.all([
    subTargets.length
      ? supabase.from("subscriptions").select("id,renewal_date").in("id", subTargets)
      : Promise.resolve({ data: [], error: null } as any),
    taskTargets.length
      ? supabase.from("tasks").select("id,due_at,due_date").in("id", taskTargets)
      : Promise.resolve({ data: [], error: null } as any),
    personTargets.length
      ? supabase.from("people").select("id,name,birth_date").in("id", personTargets)
      : Promise.resolve({ data: [], error: null } as any),
  ])

  if (subsTargetsRes?.error) return NextResponse.json({ ok: false, error: subsTargetsRes.error.message }, { status: 500 })
  if (tasksTargetsRes?.error) return NextResponse.json({ ok: false, error: tasksTargetsRes.error.message }, { status: 500 })
  if (peopleTargetsRes?.error) return NextResponse.json({ ok: false, error: peopleTargetsRes.error.message }, { status: 500 })

  const subById = new Map<string, any>((subsTargetsRes.data ?? []).map((x: any) => [x.id, x]))
  const taskById = new Map<string, any>((tasksTargetsRes.data ?? []).map((x: any) => [x.id, x]))
  const personById = new Map<string, any>((peopleTargetsRes.data ?? []).map((x: any) => [x.id, x]))

  const computedOffsetItems: TimelineItem[] = offsetRules
    .map((r: any) => {
      const offsetDays = typeof r.offset_days === "number" && r.offset_days > 0 ? Math.floor(r.offset_days) : null
      const anchor = typeof r.anchor_field === "string" ? r.anchor_field : ""
      if (!offsetDays || !anchor || !r.target_id) return null

      let anchorIso: string | null = null
      if (r.target_type === "subscription") {
        const sub = subById.get(String(r.target_id))
        const renewal = typeof sub?.renewal_date === "string" ? sub.renewal_date : null
        if (renewal) anchorIso = new Date(`${renewal}T09:00:00.000Z`).toISOString()
      } else if (r.target_type === "task") {
        const t = taskById.get(String(r.target_id))
        const dueAt = typeof t?.due_at === "string" ? t.due_at : null
        const dueDate = typeof t?.due_date === "string" ? t.due_date : null
        if (anchor === "due_at" && dueAt) anchorIso = new Date(dueAt).toISOString()
        if (!anchorIso && dueAt) anchorIso = new Date(dueAt).toISOString()
        if (!anchorIso && dueDate) anchorIso = new Date(`${dueDate}T09:00:00.000Z`).toISOString()
      } else if (r.target_type === "person") {
        const p = personById.get(String(r.target_id))
        const birth = typeof p?.birth_date === "string" ? p.birth_date : null
        if (birth) anchorIso = nextBirthdayOccurrenceIso(birth, now)
      }
      if (!anchorIso) return null
      const remindIso = new Date(new Date(anchorIso).getTime() - offsetDays * 24 * 60 * 60 * 1000).toISOString()
      if (remindIso < start.toISOString() || remindIso > end.toISOString()) return null
      return {
        type: "reminder" as const,
        title: String(r.title ?? "Reminder"),
        date: remindIso,
        meta: {
          id: r.id,
          target_type: r.target_type,
          target_id: r.target_id,
          rule_type: r.rule_type,
          channel: r.channel,
          computed: true,
        },
      }
    })
    .filter(Boolean) as TimelineItem[]

  const computedRecurringItems: TimelineItem[] = recurringRules
    .map((r: any) => {
      const rrule = typeof r.rrule === "string" ? r.rrule : ""
      if (!rrule) return null
      const createdAt = typeof r.created_at === "string" ? new Date(r.created_at) : null
      const dtStart = createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : new Date(now.toISOString().slice(0, 10) + "T09:00:00.000Z")
      const nextIso = nextRecurringOccurrenceIso(rrule, dtStart, start)
      if (!nextIso) return null
      if (nextIso < start.toISOString() || nextIso > end.toISOString()) return null
      return {
        type: "reminder" as const,
        title: String(r.title ?? "Recurring reminder"),
        date: nextIso,
        meta: { id: r.id, target_type: r.target_type, target_id: r.target_id, rule_type: r.rule_type, channel: r.channel, rrule, computed: true },
      }
    })
    .filter(Boolean) as TimelineItem[]

  const items = [...taskItems, ...subItems, ...birthdayItems, ...reminderItems, ...computedOffsetItems, ...computedRecurringItems].sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  return NextResponse.json({ ok: true, days, items })
}

