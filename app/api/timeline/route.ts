import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

type TimelineItem = {
  type: "task" | "subscription" | "birthday" | "reminder"
  title: string
  date: string // ISO timestamp
  meta?: Record<string, unknown>
}

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`)
  return v
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
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

export async function GET(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

  const days = clampDays(new URL(req.url).searchParams.get("days"))
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0))
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
  const startDateOnly = start.toISOString().slice(0, 10)
  const endDateOnly = end.toISOString().slice(0, 10)

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseAnonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

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
    .select("id,title,remind_at,target_type,target_id,rule_type,channel")
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

  const items = [...taskItems, ...subItems, ...birthdayItems, ...reminderItems].sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  return NextResponse.json({ ok: true, days, items })
}

