"use client"

import { useEffect, useMemo, useState } from "react"
import PageShell from "@/components/PageShell"
import AppHeader from "@/components/AppHeader"
import { GlassSurface } from "@/components/ui/GlassSurface"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ToastProvider"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import { humanizeError } from "@/lib/humanizeError"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export default function AdminPage() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string>("")

  const canView = useMemo(() => !!user, [user])

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/dashboard", { credentials: "include" })
      const json = (await res.json()) as any
      if (!res.ok || !json.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setData(json)
    } catch (err: unknown) {
      const msg = humanizeError(err)
      setError(msg)
      toast({ title: "Couldn’t load admin", description: msg, variant: "error" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  if (!canView) {
    return (
      <PageShell>
        <AppHeader title="Admin" onSignOut={signOut} currentPage="integrations" />
        <div className="mx-auto w-full max-w-[900px] space-y-5">
          <GlassSurface variant="subtle">
            <div className="p-6 sm:p-8">
              <div className="text-sm text-muted-foreground">Sign in to view admin.</div>
            </div>
          </GlassSurface>
        </div>
      </PageShell>
    )
  }

  const metrics = isRecord(data?.metrics) ? data.metrics : null
  const logs = Array.isArray(data?.logs) ? data.logs : []
  const ai = Array.isArray(data?.ai_usage) ? data.ai_usage : []
  const integrations = Array.isArray(data?.integrations) ? data.integrations : []

  return (
    <PageShell>
      <AppHeader title="Admin" onSignOut={signOut} currentPage="integrations" />
      <div className="mx-auto w-full max-w-[900px] space-y-5">
        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground/90">Admin dashboard</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {data?.degraded ? "Degraded mode (service role missing)" : "Service role enabled"}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
                Refresh
              </Button>
            </div>

            {error ? <div className="mt-4 text-sm text-destructive">{error}</div> : null}

            {metrics ? (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-muted-foreground">Distinct users</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground/95">
                    {Number(metrics.distinct_user_count ?? 0)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-muted-foreground">Users with subscriptions</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground/95">
                    {Number(metrics.subscriptions_user_count ?? 0)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-muted-foreground">Users with integrations</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground/95">
                    {Number(metrics.integrations_user_count ?? 0)}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </GlassSurface>

        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <div className="text-sm font-semibold text-foreground/90">Last 50 app logs</div>
            <div className="mt-3 space-y-2">
              {logs.length === 0 ? (
                <div className="text-sm text-muted-foreground">No logs.</div>
              ) : (
                logs.map((l: any) => (
                  <div key={l.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-foreground/90 truncate">
                          <span className="text-muted-foreground">{String(l.level ?? "")}</span>{" "}
                          <span className="text-foreground/90">{String(l.area ?? "")}</span> —{" "}
                          {String(l.message ?? "")}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {String(l.user_id ?? "—")} • {new Date(String(l.created_at)).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </GlassSurface>

        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <div className="text-sm font-semibold text-foreground/90">Last 50 AI usage rows</div>
            <div className="mt-3 space-y-2">
              {ai.length === 0 ? (
                <div className="text-sm text-muted-foreground">No AI usage.</div>
              ) : (
                ai.map((r: any) => (
                  <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-sm text-foreground/90 truncate">{String(r.model ?? "model")}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {String(r.user_id ?? "—")} • tokens={String(r.total_tokens ?? "—")} •{" "}
                      {new Date(String(r.created_at)).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </GlassSurface>

        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <div className="text-sm font-semibold text-foreground/90">Last 50 integrations</div>
            <div className="mt-3 space-y-2">
              {integrations.length === 0 ? (
                <div className="text-sm text-muted-foreground">No integrations.</div>
              ) : (
                integrations.map((r: any) => (
                  <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-foreground/90 truncate">
                          {String(r.provider ?? "provider")} • {String(r.status ?? "—")}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {String(r.user_id ?? "—")} • {new Date(String(r.created_at)).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </GlassSurface>

        {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
      </div>
    </PageShell>
  )
}

