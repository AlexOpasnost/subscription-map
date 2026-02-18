"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Bell, CalendarDays, CreditCard, ListChecks } from "lucide-react"

import PageShell from "@/components/PageShell"
import AppHeader from "@/components/AppHeader"
import { GlassSurface } from "@/components/ui/GlassSurface"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ToastProvider"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"

type TimelineItem = {
  type: "task" | "subscription" | "birthday" | "reminder"
  title: string
  date: string
  meta?: Record<string, unknown>
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0.00"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function iconFor(type: TimelineItem["type"]) {
  if (type === "subscription") return CreditCard
  if (type === "task") return ListChecks
  if (type === "birthday") return CalendarDays
  return Bell
}

function hrefForItem(it: TimelineItem): string | null {
  const id = typeof it.meta?.id === "string" ? it.meta.id : ""
  if (!id) return null
  if (it.type === "subscription") return `/app/subscription/${id}`
  return null
}

export default function TimelinePage() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState<"7" | "30">("7")
  const [items, setItems] = useState<TimelineItem[]>([])
  const [error, setError] = useState("")
  const [insights, setInsights] = useState<{
    monthlySpend: number
    upcomingRenewalsIn10Days: number
    categoriesWithDuplicates: number
  } | null>(null)

  const title = useMemo(() => (days === "7" ? "Timeline (7 days)" : "Timeline (30 days)"), [days])

  const load = async (nextDays: "7" | "30") => {
    if (!user) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/timeline?days=${nextDays}`, {
        method: "GET",
        credentials: "include",
      })
      const json = (await res.json()) as { ok: boolean; items?: TimelineItem[]; error?: string }
      if (!res.ok || !json.ok) {
        const msg = typeof json.error === "string" && json.error.trim() ? json.error.trim() : `HTTP ${res.status}`
        setError(msg)
        return
      }
      setItems((json.items ?? []) as TimelineItem[])

      // Lightweight insights (client-side, RLS-protected Supabase reads).
      const { data: subs, error: subsError } = await supabase
        .from("subscriptions")
        .select("price_cents,period,category,cancelled,renewal_date")
        .eq("cancelled", false)
      if (subsError) {
        // Keep non-blocking; timeline should still render.
        setInsights(null)
      } else {
        const rows = (subs ?? []) as Array<{
          price_cents: number
          period: "monthly" | "yearly"
          category: string
          cancelled: boolean
          renewal_date: string | null
        }>
        const monthlySpend = rows.reduce((sum, r) => {
          const price = (r.price_cents ?? 0) / 100
          return sum + (r.period === "yearly" ? price / 12 : price)
        }, 0)
        const now = new Date()
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0))
        const end10 = new Date(start.getTime() + 10 * 24 * 60 * 60 * 1000)
        const upcomingRenewalsIn10Days = rows.filter((r) => {
          if (!r.renewal_date) return false
          const d = new Date(`${r.renewal_date}T00:00:00.000Z`)
          return d.getTime() >= start.getTime() && d.getTime() <= end10.getTime()
        }).length
        const counts = new Map<string, number>()
        for (const r of rows) {
          const c = (r.category ?? "").trim().toLowerCase() || "other"
          counts.set(c, (counts.get(c) ?? 0) + 1)
        }
        const categoriesWithDuplicates = Array.from(counts.values()).filter((n) => n >= 2).length
        setInsights({ monthlySpend, upcomingRenewalsIn10Days, categoriesWithDuplicates })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    void load(days)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, days])

  return (
    <PageShell>
      <AppHeader title={title} onSignOut={signOut} currentPage="timeline" />

      <div className="mx-auto w-full max-w-[720px] space-y-5">
        {insights ? (
          <GlassSurface variant="subtle" className="p-0">
            <div className="p-5 sm:p-6">
              <div className="text-sm font-semibold text-foreground/90">Insights</div>
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                <div>
                  Monthly spend (subscriptions):{" "}
                  <span className="text-foreground/85 tabular-nums">{formatMoney(insights.monthlySpend)}</span>
                </div>
                <div>
                  Renewals in the next 10 days:{" "}
                  <span className="text-foreground/85 tabular-nums">{insights.upcomingRenewalsIn10Days}</span>
                </div>
                <div>
                  Categories with duplicates:{" "}
                  <span className="text-foreground/85 tabular-nums">{insights.categoriesWithDuplicates}</span>
                </div>
                {insights.upcomingRenewalsIn10Days >= 3 ? (
                  <div className="pt-1">
                    You have several renewals coming up soon. Consider reviewing them ahead of time.
                  </div>
                ) : null}
              </div>
            </div>
          </GlassSurface>
        ) : null}

        <GlassSurface className="p-0">
          <div className="p-5 sm:p-6">
            <Tabs value={days} onValueChange={(v) => setDays(v === "30" ? "30" : "7")}>
              <div className="flex items-center justify-between gap-3">
                <TabsList>
                  <TabsTrigger value="7">Next 7 days</TabsTrigger>
                  <TabsTrigger value="30">Next 30 days</TabsTrigger>
                </TabsList>
                <Button type="button" variant="outline" size="sm" onClick={() => load(days)} disabled={loading}>
                  Refresh
                </Button>
              </div>

              <TabsContent value="7" className="mt-4">
                {loading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <Skeleton className="h-4 w-48 opacity-60" />
                        <Skeleton className="mt-2 h-3 w-32 opacity-50" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="text-sm text-destructive">{error}</div>
                ) : items.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nothing coming up.</div>
                ) : (
                  <div className="space-y-3">
                    {items.map((it, idx) => {
                      const Icon = iconFor(it.type)
                      const badge = it.type
                      const href = hrefForItem(it)
                      return (
                        <div key={`${it.type}-${it.date}-${idx}`} className="rounded-2xl border border-white/10 bg-white/5">
                          {href ? (
                            <Link href={href} className="block px-4 py-3 hover:bg-white/[0.03] rounded-2xl">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                                      <Icon className="h-4 w-4 text-foreground/80" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-foreground/90 truncate">{it.title}</div>
                                      <div className="mt-0.5 text-xs text-muted-foreground">{formatWhen(it.date)}</div>
                                    </div>
                                  </div>
                                </div>
                                <Badge variant="secondary" className="shrink-0 bg-white/5 border-white/10 text-foreground/80">
                                  {badge}
                                </Badge>
                              </div>
                            </Link>
                          ) : (
                            <div className="px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                                      <Icon className="h-4 w-4 text-foreground/80" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-foreground/90 truncate">{it.title}</div>
                                      <div className="mt-0.5 text-xs text-muted-foreground">{formatWhen(it.date)}</div>
                                    </div>
                                  </div>
                                </div>
                                <Badge variant="secondary" className="shrink-0 bg-white/5 border-white/10 text-foreground/80">
                                  {badge}
                                </Badge>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="30" className="mt-4">
                {/* same list rendering; relies on `items` for current tab */}
                {loading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <Skeleton className="h-4 w-48 opacity-60" />
                        <Skeleton className="mt-2 h-3 w-32 opacity-50" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="text-sm text-destructive">{error}</div>
                ) : items.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nothing coming up.</div>
                ) : (
                  <div className="space-y-3">
                    {items.map((it, idx) => {
                      const Icon = iconFor(it.type)
                      const badge = it.type
                      const href = hrefForItem(it)
                      return (
                        <div key={`${it.type}-${it.date}-${idx}`} className="rounded-2xl border border-white/10 bg-white/5">
                          {href ? (
                            <Link href={href} className="block px-4 py-3 hover:bg-white/[0.03] rounded-2xl">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                                      <Icon className="h-4 w-4 text-foreground/80" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-foreground/90 truncate">{it.title}</div>
                                      <div className="mt-0.5 text-xs text-muted-foreground">{formatWhen(it.date)}</div>
                                    </div>
                                  </div>
                                </div>
                                <Badge variant="secondary" className="shrink-0 bg-white/5 border-white/10 text-foreground/80">
                                  {badge}
                                </Badge>
                              </div>
                            </Link>
                          ) : (
                            <div className="px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                                      <Icon className="h-4 w-4 text-foreground/80" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-foreground/90 truncate">{it.title}</div>
                                      <div className="mt-0.5 text-xs text-muted-foreground">{formatWhen(it.date)}</div>
                                    </div>
                                  </div>
                                </div>
                                <Badge variant="secondary" className="shrink-0 bg-white/5 border-white/10 text-foreground/80">
                                  {badge}
                                </Badge>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="mt-4 text-xs text-muted-foreground">
              Tip: you can create items via the Assistant. Try{" "}
              <Link href="/assistant" className="underline text-foreground/80">
                “what’s due this week?”
              </Link>
              .
            </div>
          </div>
        </GlassSurface>
      </div>
    </PageShell>
  )
}

