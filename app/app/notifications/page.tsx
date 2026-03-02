"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bell } from "lucide-react"

import PageShell from "@/components/PageShell"
import AppHeader from "@/components/AppHeader"
import { GlassSurface } from "@/components/ui/GlassSurface"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/supabase/auth"
import { useToast } from "@/components/ToastProvider"
import { humanizeError } from "@/lib/humanizeError"

type Notification = {
  id: string
  channel: "in_app" | "email" | "telegram"
  type: string
  title: string
  body: string | null
  status: "pending" | "processing" | "sent" | "failed" | "cancelled"
  run_at: string
  sent_at: string | null
  attempts: number
  last_error: string | null
  created_at: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export default function NotificationsPage() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const [status, setStatus] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Notification[]>([])
  const [error, setError] = useState("")

  const statusLabel = useMemo(() => (status ? status : "all"), [status])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError("")
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : ""
      const res = await fetch(`/api/notifications/list${qs}`, { method: "GET", credentials: "include" })
      const json: unknown = await res.json()
      if (!res.ok) throw new Error(isRecord(json) && typeof json.error === "string" ? json.error : "Failed to load notifications")
      const rows = isRecord(json) && Array.isArray(json.notifications) ? (json.notifications as Notification[]) : []
      setItems(rows)
    } catch (err: unknown) {
      const msg = humanizeError(err)
      setError(msg)
      toast({ title: "Couldn’t load notifications", description: msg, variant: "error" })
    } finally {
      setLoading(false)
    }
  }, [status, toast, user])

  useEffect(() => {
    if (!user) return
    load()
  }, [user, load])

  const runNow = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/run", { method: "POST", credentials: "include" })
      const json: unknown = await res.json()
      if (!res.ok) throw new Error(isRecord(json) && typeof json.error === "string" ? json.error : "Failed to run worker")
      const processed = isRecord(json) && typeof json.processed === "number" ? json.processed : 0
      toast({ title: "Worker ran", description: `Processed ${processed} notifications.`, variant: "success" })
      await load()
    } catch (err: unknown) {
      toast({ title: "Worker failed", description: humanizeError(err), variant: "error" })
    }
  }, [load, toast])

  const createTest = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/test", { method: "POST", credentials: "include" })
      const json: unknown = await res.json()
      if (!res.ok) throw new Error(isRecord(json) && typeof json.error === "string" ? json.error : "Failed to create test notification")
      toast({ title: "Test notification scheduled", description: "Due in ~1 minute.", variant: "success" })
      await load()
    } catch (err: unknown) {
      toast({ title: "Test failed", description: humanizeError(err), variant: "error" })
    }
  }, [load, toast])

  return (
    <PageShell>
      <AppHeader title="Notifications" onSignOut={signOut} currentPage="notifications" />

      <div className="mx-auto w-full max-w-[720px] space-y-5">
        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-foreground/80" aria-hidden="true" />
                <div className="text-sm font-semibold text-foreground/90">In-app + email notifications</div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Showing <span className="text-foreground/80">{statusLabel}</span> notifications (last 50).
              </div>
              {error ? <div className="mt-2 text-xs text-destructive">{error}</div> : null}
            </div>
            <div className="shrink-0 flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={createTest} disabled={!user}>
                Create test
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={runNow} disabled={!user}>
                Run worker
              </Button>
            </div>
          </div>
        </GlassSurface>

        <GlassSurface variant="subtle" className="p-0">
          <div className="p-4 sm:p-5 flex flex-wrap items-center gap-2">
            {["", "pending", "processing", "sent", "failed", "cancelled"].map((s) => (
              <Button
                key={s || "all"}
                type="button"
                variant={status === s ? "primary" : "outline"}
                size="sm"
                onClick={() => setStatus(s)}
                disabled={loading}
              >
                {s || "all"}
              </Button>
            ))}
          </div>
        </GlassSurface>

        <div className="space-y-3">
          {loading ? (
            <GlassSurface variant="subtle">
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            </GlassSurface>
          ) : items.length === 0 ? (
            <GlassSurface variant="subtle">
              <div className="p-6 text-sm text-muted-foreground">No notifications yet.</div>
            </GlassSurface>
          ) : (
            items.map((n) => (
              <GlassSurface key={n.id} variant="subtle">
                <div className="p-4 sm:p-5 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground/90 truncate">{n.title}</div>
                      {n.body ? <div className="mt-1 text-xs text-muted-foreground">{n.body}</div> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-foreground/80">{n.status}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{new Date(n.run_at).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="pt-2 text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    <span>channel={n.channel}</span>
                    <span>type={n.type}</span>
                    <span>attempts={n.attempts}</span>
                    {n.last_error ? <span className="text-destructive">error={n.last_error}</span> : null}
                  </div>
                </div>
              </GlassSurface>
            ))
          )}
        </div>
      </div>
    </PageShell>
  )
}

