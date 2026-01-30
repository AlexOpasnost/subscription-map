"use client"

import { useEffect, useMemo, useState } from "react"

import PageShell from "@/components/PageShell"
import AppHeader from "@/components/AppHeader"
import { GlassSurface } from "@/components/ui/GlassSurface"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ToastProvider"
import { getIntentPreview, parseInput } from "@/lib/assistant/parse"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import { humanizeError } from "@/lib/humanizeError"

type AssistantApiResponse =
  | { kind: "action" | "query"; message: string; data?: unknown; preview?: unknown; sync?: { enqueued: number } }
  | { kind: "error"; message: string; details?: unknown; preview?: unknown }

type AssistantEventRow = {
  id: string
  input_text: string
  parsed: unknown
  status: string
  error: string | null
  created_at: string
}

type AssistantActivityRow = {
  id: string
  kind: string
  command: string
  result: unknown
  created_at: string
}

type SpendingResult = { monthly_total: number; yearly_total: number }
type UpcomingRenewalItem = {
  id: string
  service: string
  renewal_date: string | null
  price_cents: number
  period: string
  category: string
}
type UpcomingRenewalsResult = { items: UpcomingRenewalItem[] }

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0.00"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function isSpendingResult(v: unknown): v is SpendingResult {
  if (!isRecord(v)) return false
  return typeof v.monthly_total === "number" && typeof v.yearly_total === "number"
}

function isUpcomingRenewalsResult(v: unknown): v is UpcomingRenewalsResult {
  if (!isRecord(v)) return false
  if (!Array.isArray(v.items)) return false
  return true
}

export default function AssistantPage() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [events, setEvents] = useState<AssistantEventRow[]>([])
  const [activity, setActivity] = useState<AssistantActivityRow[] | null>(null)
  const [lastResult, setLastResult] = useState<AssistantApiResponse | null>(null)

  const canSend = useMemo(() => text.trim().length > 0 && !sending, [text, sending])
  const livePreview = useMemo(() => {
    const s = text.trim()
    if (!s) return null
    const { parsed } = parseInput(s)
    return getIntentPreview(parsed)
  }, [text])

  const loadEvents = async () => {
    // Prefer the newer assistant_activity log (if present); fall back to assistant_events.
    const activityRes = await supabase
      .from("assistant_activity")
      .select("id,kind,command,result,created_at")
      .order("created_at", { ascending: false })
      .limit(20)

    if (!activityRes.error) {
      setActivity((activityRes.data ?? []) as AssistantActivityRow[])
      return
    }

    const { data, error } = await supabase
      .from("assistant_events")
      .select("id,input_text,parsed,status,error,created_at")
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      if (process.env.NODE_ENV !== "production") console.error(error)
      return
    }
    setActivity(null)
    setEvents((data ?? []) as AssistantEventRow[])
  }

  useEffect(() => {
    if (!user) return
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const send = async () => {
    if (!canSend) return
    if (!user) return

    setSending(true)
    setLastResult(null)
    const parsedNow = parseInput(text.trim()).parsed
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        toast({ title: "You’re signed out", description: "Please sign in again.", variant: "error" })
        return
      }

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ command: text, userId: user.id }),
      })

      const json = (await res.json()) as AssistantApiResponse
      setLastResult(json)

      if (!res.ok || json.kind === "error") {
        console.error("[assistant] save failed", { status: res.status, json })
        const raw = json.message ?? "Unexpected error"
        const friendly = humanizeError(raw)
        const needsRlsHint = raw.toLowerCase().includes("row level security") || raw.toLowerCase().includes("rls")
        const extra = needsRlsHint ? " This looks like an RLS policy issue—check your `subscriptions` policies." : ""
        toast({
          title: "Couldn’t save",
          description: `${friendly} See console for details.${extra}`,
          variant: "error",
        })
        return
      }

      const enqueued = typeof json.sync?.enqueued === "number" ? json.sync.enqueued : 0
      const suffix = enqueued > 0 ? ` (Sync queued for ${enqueued})` : ""
      const isAddSubscription =
        parsedNow.kind === "action" && "action" in parsedNow && parsedNow.action === "add_subscription"
      toast({
        title: isAddSubscription ? "Subscription added" : "Saved",
        description: `${json.message}${suffix}`,
        variant: "success",
      })
      setText("")
      await loadEvents()
    } catch (err: unknown) {
      console.error("[assistant] send failed", err)
      const raw = err instanceof Error ? err.message : "Unexpected error"
      const friendly = humanizeError(raw)
      const needsRlsHint = raw.toLowerCase().includes("row level security") || raw.toLowerCase().includes("rls")
      const extra = needsRlsHint ? " This looks like an RLS policy issue—check your `subscriptions` policies." : ""
      toast({ title: "Couldn’t save", description: `${friendly} See console for details.${extra}`, variant: "error" })
    } finally {
      setSending(false)
    }
  }

  const renderResult = () => {
    if (!lastResult || lastResult.kind === "error") return null
    if (lastResult.kind === "query") {
      const data = lastResult.data
      if (isSpendingResult(data)) {
        return (
          <GlassSurface variant="subtle" className="p-0">
            <div className="p-5 sm:p-6">
              <div className="text-sm font-semibold text-foreground/90">Spending</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-muted-foreground">Monthly</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground/95">
                    {formatMoney(data.monthly_total)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-muted-foreground">Yearly</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground/95">
                    {formatMoney(data.yearly_total)}
                  </div>
                </div>
              </div>
            </div>
          </GlassSurface>
        )
      }

      // upcoming renewals
      if (isUpcomingRenewalsResult(data)) {
        return (
          <GlassSurface variant="subtle" className="p-0">
            <div className="p-5 sm:p-6">
              <div className="text-sm font-semibold text-foreground/90">Upcoming renewals</div>
              <div className="mt-3 space-y-2">
                {data.items.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No renewals in the next 30 days.</div>
                ) : (
                  (data.items as unknown[]).slice(0, 10).map((raw) => {
                    const x = isRecord(raw) ? raw : {}
                    const id = typeof x.id === "string" ? x.id : ""
                    const service = typeof x.service === "string" ? x.service : "Subscription"
                    const renewalDate = typeof x.renewal_date === "string" ? x.renewal_date : ""
                    const priceCents = typeof x.price_cents === "number" ? x.price_cents : 0
                    return (
                      <div key={id || service} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate text-foreground/90">{service}</div>
                        <div className="text-xs text-muted-foreground">{renewalDate}</div>
                      </div>
                      <div className="text-sm tabular-nums text-foreground/85 shrink-0">
                        ${(priceCents / 100).toFixed(2)}
                      </div>
                    </div>
                    )
                  })
                )}
              </div>
            </div>
          </GlassSurface>
        )
      }
    }
    return null
  }

  return (
    <PageShell>
      <AppHeader title="Assistant" onSignOut={signOut} currentPage="assistant" />

      <div className="mx-auto w-full max-w-[720px] space-y-5">
        <GlassSurface className="p-0">
          <div className="p-6 sm:p-8">
            <div className="text-sm font-semibold text-foreground/90">Assistant Inbox</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Type a command like: <span className="text-foreground/80">add task pay rent due 2026-02-01</span>
            </div>

            <div className="mt-4 space-y-3">
              {livePreview ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Preview</div>
                  <div className="mt-1 text-sm font-medium text-foreground/90">{livePreview.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{livePreview.summary}</div>
                </div>
              ) : null}

              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What do you want to do?"
                disabled={sending}
                className="min-h-[110px]"
              />
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="primary"
                  className="h-11 px-5 text-[15px] font-semibold tracking-tight"
                  onClick={send}
                  disabled={!canSend}
                  loading={sending}
                  loadingText="Saving…"
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        </GlassSurface>

        {renderResult()}

        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-semibold text-foreground/90">Activity</div>
              <Button type="button" variant="outline" size="sm" onClick={loadEvents} disabled={sending}>
                Refresh
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {activity ? (
                activity.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No activity yet.</div>
                ) : (
                  activity.map((ev) => {
                    const result = isRecord(ev.result) ? ev.result : {}
                    const message = typeof result.message === "string" ? result.message : ""
                    return (
                      <div key={ev.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground/90 truncate">{ev.command}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {new Date(ev.created_at).toLocaleString()}
                            </div>
                            {message ? (
                              <div className="mt-2 text-sm text-muted-foreground">{message}</div>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0">{ev.kind}</div>
                        </div>
                      </div>
                    )
                  })
                )
              ) : events.length === 0 ? (
                <div className="text-sm text-muted-foreground">No activity yet.</div>
              ) : (
                events.map((ev) => (
                  <div key={ev.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground/90 truncate">{ev.input_text}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(ev.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {ev.status === "ok" ? "ok" : "error"}
                      </div>
                    </div>
                    {ev.status !== "ok" && ev.error ? (
                      <div className="mt-2 text-sm text-destructive">{ev.error}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </GlassSurface>
      </div>
    </PageShell>
  )
}

