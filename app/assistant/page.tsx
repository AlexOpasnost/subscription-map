"use client"

/**
 * How to verify:
 * - `npm run dev`
 * - Sign in
 * - Type: `add task Pay rent due 2026-02-01`
 * - Expect: toast "Task added", and a new entry in Activity
 * - Refresh page, run "Refresh" → task still appears
 */

import { useEffect, useMemo, useState } from "react"

import PageShell from "@/components/PageShell"
import AppHeader from "@/components/AppHeader"
import { GlassSurface } from "@/components/ui/GlassSurface"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { useToast } from "@/components/ToastProvider"
import { getIntentPreview, parseInput } from "@/lib/assistant/parse"
import type { Action } from "@/lib/assistant/actionSchema"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"

type AssistantApiResponse =
  | { ok: true; stage: "preview" | "executed"; message: string; intent: unknown; preview: unknown; result?: unknown; sync?: { enqueued: number } }
  | { ok: false; error: string; stage?: "preview" | "executed"; intent?: unknown; preview?: unknown; details?: unknown }

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

type TaskRow = {
  id: string
  title: string
  due_date: string | null
  status: string
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

type AiParseResponse = { action: Action; error?: string }
type AiExecuteResponse = { ok: true; action: Action; result?: unknown; message?: string } | { ok: false; error: string; action?: Action }

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0.00"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function formatPreviewValue(v: unknown): string {
  if (v === null || typeof v === "undefined") return "—"
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function renderPreviewDetails(preview: unknown) {
  if (!isRecord(preview)) return null
  const details = preview.details
  if (!isRecord(details)) return null
  const entries = Object.entries(details).filter(([_, v]) => typeof v !== "undefined")
  if (entries.length === 0) return null
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {entries.slice(0, 8).map(([k, v]) => (
        <div key={k} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
          <div className="mt-0.5 text-xs text-foreground/85 break-words">{formatPreviewValue(v)}</div>
        </div>
      ))}
    </div>
  )
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

function isAiSpendingPayload(v: unknown): v is { monthly_total?: number; yearly_total?: number } {
  if (!isRecord(v)) return false
  const m = (v as any).monthly_total
  const y = (v as any).yearly_total
  return (typeof m === "number" && Number.isFinite(m)) || (typeof y === "number" && Number.isFinite(y))
}

function isAiTimelinePayload(v: unknown): v is { from: string; to: string; items: Array<{ type: string; title: string; date: string }> } {
  if (!isRecord(v)) return false
  if (typeof (v as any).from !== "string") return false
  if (typeof (v as any).to !== "string") return false
  if (!Array.isArray((v as any).items)) return false
  return true
}

export default function AssistantPage() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [aiMode, setAiMode] = useState(true)
  const [isParsing, setIsParsing] = useState(false)
  const [events, setEvents] = useState<AssistantEventRow[]>([])
  const [activity, setActivity] = useState<AssistantActivityRow[] | null>(null)
  const [tasks, setTasks] = useState<TaskRow[] | null>(null)
  const [lastResult, setLastResult] = useState<AssistantApiResponse | null>(null)
  const [aiLastResult, setAiLastResult] = useState<AiExecuteResponse | null>(null)
  const [pendingPreview, setPendingPreview] = useState<{
    commandText: string
    intent: unknown
    preview: unknown
  } | null>(null)
  const [pendingAction, setPendingAction] = useState<{ text: string; action: Action } | null>(null)

  const canSend = useMemo(() => text.trim().length > 0 && !sending && !isParsing, [text, sending, isParsing])
  const runNotificationsTest = async () => {
    try {
      const t = await fetch("/api/notifications/test", { method: "POST", credentials: "include" })
      const tj = await t.json()
      console.log("[notifications/test]", { status: t.status, body: tj })
      const r = await fetch("/api/notifications/run", { method: "POST", credentials: "include" })
      const rj = await r.json()
      console.log("[notifications/run]", { status: r.status, body: rj })
      toast({ title: "Notifications worker ran", description: "Check console for results.", variant: "success" })
    } catch (err: unknown) {
      console.error("[notifications] test/run failed", err)
      const msg = err instanceof Error ? err.message : "Notifications test failed"
      toast({ title: "Notifications test failed", description: msg, variant: "error" })
    }
  }
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

  const loadTasks = async () => {
    try {
      const res = await fetch("/api/tasks/list", {
        method: "GET",
        credentials: "include",
      })
      const json = (await res.json()) as { ok: boolean; tasks?: TaskRow[]; error?: string }
      if (!res.ok || !json.ok) {
        console.error("[assistant] loadTasks failed", { status: res.status, json })
        return
      }
      setTasks((json.tasks ?? []) as TaskRow[])
    } catch (err) {
      console.error("[assistant] loadTasks error", err)
    }
  }

  useEffect(() => {
    if (!user) return
    loadEvents()
    loadTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const sendLegacy = async () => {
    if (!canSend) return
    if (!user) return

    setSending(true)
    setLastResult(null)
    try {
      const res = await fetch("/api/assistant?mode=preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ text }),
      })

      const json = (await res.json()) as AssistantApiResponse
      setLastResult(json)

      if (!res.ok || !json.ok) {
        console.error("[assistant] preview failed", { status: res.status, json })
        const raw = !json.ok && typeof json.error === "string" && json.error.trim() ? json.error.trim() : `HTTP ${res.status}`
        toast({ title: "Couldn’t preview", description: raw, variant: "error" })
        return
      }

      setPendingPreview({ commandText: text, intent: json.intent, preview: json.preview })
    } catch (err: unknown) {
      console.error("[assistant] preview request failed", err)
      const raw = err instanceof Error ? err.message : "Network error"
      toast({ title: "Couldn’t preview", description: raw, variant: "error" })
    } finally {
      setSending(false)
    }
  }

  function previewForAction(action: Action): { title: string; summary: string; details?: Record<string, unknown> } {
    if (action.type === "add_task") {
      return {
        title: "Task",
        summary: action.due_date ? `${action.title} on ${action.due_date}` : action.title,
        details: {
          title: action.title,
          due_date: action.due_date,
          remind_days_before: action.remind_days_before,
          notes: action.notes,
        },
      }
    }
    if (action.type === "add_subscription") {
      return {
        title: "Subscription",
        summary: `${action.service}${action.period ? ` (${action.period})` : ""}`,
        details: {
          service: action.service,
          plan: action.plan,
          price_cents: action.price_cents,
          period: action.period,
          category: action.category,
          next_renewal: action.next_renewal,
          remind_days_before: action.remind_days_before,
        },
      }
    }
    if (action.type === "add_plan") {
      return {
        title: "Plan",
        summary: action.date ? `${action.title} on ${action.date}` : action.title,
        details: { title: action.title, date: action.date, notes: action.notes },
      }
    }
    if (action.type === "question_spending") {
      return { title: "Question", summary: `Spending (${action.timeframe ?? "month"})`, details: { timeframe: action.timeframe ?? "month" } }
    }
    if (action.type === "timeline") {
      return { title: "Question", summary: `Timeline (${action.from ?? "today"} → ${action.to ?? "next 7 days"})`, details: { from: action.from, to: action.to } }
    }
    return { title: "Unsupported", summary: action.reason, details: { reason: action.reason, suggestions: action.suggestions } }
  }

  const sendAiParse = async () => {
    if (!canSend) return
    if (!user) return

    setIsParsing(true)
    setLastResult(null)
    setAiLastResult(null)
    try {
      const res = await fetch("/api/assistant/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ text }),
      })

      const json = (await res.json()) as AiParseResponse
      if (!res.ok || !json?.action) {
        const msg = typeof (json as any)?.error === "string" ? String((json as any).error) : `HTTP ${res.status}`
        toast({ title: "Couldn’t parse", description: msg, variant: "error" })
        return
      }

      // Parse -> execute flow (persist to Supabase).
      console.log("[assistant] parsed action", json.action)
      const execRes = await fetch("/api/assistant/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: json.action, text }),
      })
      const execJson = (await execRes.json()) as AiExecuteResponse
      setAiLastResult(execJson)
      if (!execRes.ok || !execJson.ok) {
        const msg = !execJson.ok && typeof execJson.error === "string" ? execJson.error : `HTTP ${execRes.status}`
        toast({ title: "Couldn’t save", description: msg, variant: "error" })
        return
      }

      toast({ title: "Saved", description: typeof execJson.message === "string" ? execJson.message : "Done.", variant: "success" })
      setText("")
      setPendingAction(null)
      await loadEvents()
      await loadTasks()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error"
      toast({ title: "Couldn’t save", description: msg, variant: "error" })
    } finally {
      setIsParsing(false)
    }
  }

  const send = async () => {
    if (aiMode) return await sendAiParse()
    return await sendLegacy()
  }

  const confirmExecuteAction = async () => {
    if (!pendingAction) return
    if (!user) return
    setSending(true)
    try {
      const res = await fetch("/api/assistant/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: pendingAction.action, text: pendingAction.text }),
      })
      const json = (await res.json()) as AiExecuteResponse
      setAiLastResult(json)

      if (!res.ok || !json.ok) {
        console.error("[assistant] AI execute failed", { status: res.status, json })
        const msg = !json.ok && typeof json.error === "string" ? json.error : `HTTP ${res.status}`
        toast({ title: "Couldn’t execute", description: msg, variant: "error" })
        return
      }

      if (pendingAction.action.type === "unsupported") {
        toast({ title: "Unsupported", description: pendingAction.action.reason, variant: "error" })
      } else {
        toast({ title: "Saved", description: typeof json.message === "string" ? json.message : "Done.", variant: "success" })
      }

      setText("")
      setPendingAction(null)
      await loadEvents()
      await loadTasks()
    } finally {
      setSending(false)
    }
  }

  const confirmExecute = async () => {
    if (!pendingPreview) return
    if (!user) return
    setSending(true)
    try {
      const res = await fetch("/api/assistant?mode=execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ text: pendingPreview.commandText }),
      })

      const json = (await res.json()) as AssistantApiResponse
      setLastResult(json)

      if (!res.ok || !json.ok) {
        console.error("[assistant] execute failed", { status: res.status, json })
        const raw = !json.ok && typeof json.error === "string" && json.error.trim() ? json.error.trim() : `HTTP ${res.status}`
        toast({ title: "Couldn’t save", description: raw, variant: "error" })
        return
      }

      toast({ title: "Saved", description: json.message, variant: "success" })
      setText("")
      setPendingPreview(null)
      await loadEvents()
      await loadTasks()
    } catch (err: unknown) {
      console.error("[assistant] execute request failed", err)
      const raw = err instanceof Error ? err.message : "Network error"
      toast({ title: "Couldn’t save", description: raw, variant: "error" })
    } finally {
      setSending(false)
    }
  }

  const renderResult = () => {
    if (!lastResult || !lastResult.ok) return null
    if (lastResult.stage !== "executed") return null
    const data = lastResult.result
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
    return null
  }

  const renderAiResult = () => {
    if (!aiLastResult || !aiLastResult.ok) return null
    const data = aiLastResult.result
    if (isAiSpendingPayload(data)) {
      const m = typeof (data as any).monthly_total === "number" ? (data as any).monthly_total : null
      const y = typeof (data as any).yearly_total === "number" ? (data as any).yearly_total : null
      return (
        <GlassSurface variant="subtle" className="p-0">
          <div className="p-5 sm:p-6">
            <div className="text-sm font-semibold text-foreground/90">Spending</div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {m !== null ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-muted-foreground">Monthly</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground/95">{formatMoney(m)}</div>
                </div>
              ) : null}
              {y !== null ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-muted-foreground">Yearly</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground/95">{formatMoney(y)}</div>
                </div>
              ) : null}
            </div>
          </div>
        </GlassSurface>
      )
    }

    if (isAiTimelinePayload(data)) {
      const items = (data as any).items as Array<{ type: string; title: string; date: string }>
      return (
        <GlassSurface variant="subtle" className="p-0">
          <div className="p-5 sm:p-6">
            <div className="text-sm font-semibold text-foreground/90">Timeline</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {String((data as any).from)} → {String((data as any).to)}
            </div>
            <div className="mt-3 space-y-2">
              {items.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nothing coming up.</div>
              ) : (
                items.slice(0, 12).map((it, idx) => (
                  <div key={`${it.type}-${it.date}-${idx}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground/90 truncate">{it.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{new Date(it.date).toLocaleString()}</div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">{it.type}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </GlassSurface>
      )
    }

    return null
  }

  return (
    <PageShell>
      <AppHeader title="Assistant" onSignOut={signOut} currentPage="assistant" />

      <div className="mx-auto w-full max-w-[720px] space-y-5">
        <GlassSurface className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-foreground/85">Notifications</div>
            <Button type="button" variant="outline" size="sm" onClick={runNotificationsTest} disabled={!user}>
              Send test notification
            </Button>
          </div>
        </GlassSurface>

        <GlassSurface className="p-0">
          <div className="p-6 sm:p-8">
            <div className="text-sm font-semibold text-foreground/90">Assistant Inbox</div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-sm text-foreground/85">AI mode</div>
              <Checkbox
                checked={aiMode}
                onChange={() => {
                  setAiMode((v) => !v)
                  setPendingAction(null)
                  setPendingPreview(null)
                  setLastResult(null)
                  setAiLastResult(null)
                }}
                label=""
              />
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Type a command like: <span className="text-foreground/80">add task pay rent due 2026-02-01</span>
            </div>

            <div className="mt-4 space-y-3">
              {!aiMode && !pendingPreview && livePreview ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Preview</div>
                  <div className="mt-1 text-sm font-medium text-foreground/90">
                    I will create: {livePreview.title}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{livePreview.summary}</div>
                  {renderPreviewDetails(livePreview)}
                </div>
              ) : null}

              {aiMode && pendingAction ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Preview</div>
                  <div className="mt-1 text-sm font-medium text-foreground/90">
                    I will create: {previewForAction(pendingAction.action).title}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{previewForAction(pendingAction.action).summary}</div>
                  {renderPreviewDetails({ details: previewForAction(pendingAction.action).details ?? {} })}
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      className="h-10"
                      onClick={confirmExecuteAction}
                      disabled={sending}
                      loading={sending}
                      loadingText="Saving…"
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={() => setPendingAction(null)}
                      disabled={sending}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10"
                      onClick={() => {
                        setPendingAction(null)
                        setLastResult(null)
                        setAiLastResult(null)
                        setText("")
                      }}
                      disabled={sending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : pendingPreview ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Preview</div>
                  <div className="mt-1 text-sm font-medium text-foreground/90">
                    {isRecord(pendingPreview.preview) && typeof (pendingPreview.preview as any).title === "string"
                      ? `I will create: ${String((pendingPreview.preview as any).title)}`
                      : "Preview"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {isRecord(pendingPreview.preview) && typeof (pendingPreview.preview as any).summary === "string"
                      ? String((pendingPreview.preview as any).summary)
                      : "Review and confirm."}
                  </div>
                  {renderPreviewDetails(pendingPreview.preview)}
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <Button type="button" variant="primary" className="h-10" onClick={confirmExecute} disabled={sending} loading={sending} loadingText="Saving…">
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={() => setPendingPreview(null)}
                      disabled={sending}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10"
                      onClick={() => {
                        setPendingPreview(null)
                        setLastResult(null)
                        setText("")
                      }}
                      disabled={sending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What do you want to do?"
                disabled={sending || !!pendingPreview || !!pendingAction || isParsing}
                className="min-h-[110px]"
              />
              <div className="flex items-center justify-end">
                {!pendingPreview && !pendingAction ? (
                  <Button
                    type="button"
                    variant="primary"
                    className="h-11 px-5 text-[15px] font-semibold tracking-tight"
                    onClick={send}
                    disabled={!canSend}
                    loading={sending || isParsing}
                    loadingText={aiMode ? "Parsing…" : "Previewing…"}
                  >
                    Send
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </GlassSurface>

        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="examples" className="border-none">
                <AccordionTrigger className="hover:no-underline text-sm font-semibold text-foreground/90">
                  Supported examples
                </AccordionTrigger>
                <AccordionContent>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    <div>add subscription Spotify Duo $14.99 monthly</div>
                    <div>add task Tax payment due 2026-04-30 amount $1200</div>
                    <div>add birthday Mom 2000-05-12 remind 7 days before</div>
                    <div>remind me to cancel Netflix on the 21st</div>
                    <div>remind me to cancel Netflix 3 days before renewal</div>
                    <div>Добавь подписку Spotify $14.99 ежемесячно</div>
                    <div>Напомни отменить Netflix 22 февраля</div>
                    <div>Сколько я трачу в этом месяце?</div>
                    <div>Что у меня на этой неделе?</div>
                    <div>what am i spending monthly?</div>
                    <div>what's due this week?</div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </GlassSurface>

        {renderAiResult()}
        {renderResult()}

        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-semibold text-foreground/90">Activity</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await loadEvents()
                  await loadTasks()
                }}
                disabled={sending}
              >
                Refresh
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {tasks && tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasks.slice(0, 10).map((t) => (
                    <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground/90 truncate">{t.title}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {t.due_date ? `Due ${t.due_date}` : "No due date"} •{" "}
                            {new Date(t.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">task</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
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

