"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, NotepadText, Plug, ShieldAlert } from "lucide-react"

import PageShell from "@/components/PageShell"
import AppHeader from "@/components/AppHeader"
import { GlassSurface } from "@/components/ui/GlassSurface"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ToastProvider"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import { humanizeError } from "@/lib/humanizeError"

type Provider = "google" | "notion"

type IntegrationRow = {
  provider: Provider
  meta: unknown
  created_at: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function getMetaString(meta: unknown, key: string): string {
  if (!isRecord(meta)) return ""
  const v = meta[key]
  return typeof v === "string" ? v : ""
}

export default function IntegrationsPage() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<IntegrationRow[]>([])
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null)
  const [notionDatabaseId, setNotionDatabaseId] = useState("")
  const [savingNotionDb, setSavingNotionDb] = useState(false)

  const providers = useMemo(() => {
    const set = new Set(rows.map((r) => r.provider))
    return {
      google: set.has("google"),
      notion: set.has("notion"),
    }
  }, [rows])

  const notionRow = useMemo(() => rows.find((r) => r.provider === "notion") ?? null, [rows])
  const notionDbIdFromMeta = useMemo(() => getMetaString(notionRow?.meta, "notion_database_id"), [notionRow?.meta])

  const load = async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("integrations")
        .select("provider,meta,created_at")
        .order("created_at", { ascending: false })
      if (error) throw error
      const list = (data ?? []) as IntegrationRow[]
      setRows(list)
      const notion = list.find((r) => r.provider === "notion")
      const nextDbId = getMetaString(notion?.meta, "notion_database_id")
      setNotionDatabaseId(nextDbId)
    } catch (err: unknown) {
      const msg = humanizeError(err)
      toast({ title: "Couldn’t load integrations", description: msg, variant: "error" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("connected")
    const error = params.get("error")
    const details = params.get("details")

    if (connected === "google" || connected === "notion") {
      toast({ title: "Connected", description: `Connected ${connected === "google" ? "Google Calendar" : "Notion"}.`, variant: "success" })
      router.replace("/settings/integrations")
    } else if (error) {
      toast({
        title: "Couldn’t connect integration",
        description: details ? `${error} — ${details}` : error,
        variant: "error",
      })
      router.replace("/settings/integrations")
    }
  }, [router, toast])

  const startConnect = async (provider: Provider) => {
    if (!user) return
    if (busyProvider) return
    setBusyProvider(provider)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        toast({ title: "You’re signed out", description: "Please sign in again.", variant: "error" })
        return
      }

      const res = await fetch(`/api/integrations/${provider}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = (await res.json()) as { url?: unknown; error?: unknown }
      const url = typeof json.url === "string" ? json.url : ""
      const errMsg = typeof json.error === "string" ? json.error : "Couldn’t start OAuth"
      if (!res.ok || !url) {
        toast({ title: "Couldn’t start OAuth", description: errMsg, variant: "error" })
        return
      }
      window.location.href = url
    } catch (err: unknown) {
      toast({ title: "Couldn’t start OAuth", description: humanizeError(err), variant: "error" })
    } finally {
      setBusyProvider(null)
    }
  }

  const disconnect = async (provider: Provider) => {
    if (!user) return
    if (busyProvider) return
    setBusyProvider(provider)
    try {
      const { error } = await supabase.from("integrations").delete().eq("provider", provider)
      if (error) throw error
      toast({ title: "Disconnected", variant: "success" })
      await load()
    } catch (err: unknown) {
      toast({ title: "Couldn’t disconnect", description: humanizeError(err), variant: "error" })
    } finally {
      setBusyProvider(null)
    }
  }

  const saveNotionDatabaseId = async () => {
    if (!user) return
    if (savingNotionDb) return
    const dbId = notionDatabaseId.trim()
    if (!dbId) {
      toast({ title: "Database ID required", description: "Paste a Notion database ID.", variant: "error" })
      return
    }
    setSavingNotionDb(true)
    try {
      const meta = isRecord(notionRow?.meta) ? notionRow?.meta : {}
      const nextMeta = { ...meta, notion_database_id: dbId }
      const { error } = await supabase.from("integrations").update({ meta: nextMeta }).eq("provider", "notion")
      if (error) throw error
      toast({ title: "Saved", description: "Notion database ID saved.", variant: "success" })
      await load()
    } catch (err: unknown) {
      toast({ title: "Couldn’t save Notion settings", description: humanizeError(err), variant: "error" })
    } finally {
      setSavingNotionDb(false)
    }
  }

  const Card = ({
    provider,
    title,
    description,
    icon,
  }: {
    provider: Provider
    title: string
    description: string
    icon: React.ReactNode
  }) => {
    const connected = providers[provider]
    return (
      <GlassSurface className="p-0">
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shrink-0">
                  {icon}
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold tracking-tight text-foreground/95 truncate">{title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className={connected ? "text-foreground/90" : "text-muted-foreground"}>
                  {connected ? "Connected" : "Not connected"}
                </span>
              </div>
            </div>

            <div className="shrink-0">
              {connected ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => disconnect(provider)}
                  disabled={busyProvider !== null}
                  className="h-10"
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => startConnect(provider)}
                  disabled={busyProvider !== null}
                  className="h-10"
                >
                  Connect
                </Button>
              )}
            </div>
          </div>

          {provider === "notion" && connected ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-xl border border-white/10 bg-white/5 shrink-0">
                  <ShieldAlert className="h-3.5 w-3.5 text-foreground/80" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground/90">Notion database</div>
                  <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    To sync tasks/plans/subscriptions to Notion, paste a database ID. You can copy it from the database URL
                    (the long string after your workspace and before <span className="font-mono">?v=</span>).
                  </div>

                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <Input
                      value={notionDatabaseId}
                      onChange={(e) => setNotionDatabaseId(e.target.value)}
                      placeholder="notion_database_id"
                      disabled={savingNotionDb}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={saveNotionDatabaseId}
                      disabled={savingNotionDb || !notionDatabaseId.trim()}
                      className="h-10"
                      loading={savingNotionDb}
                      loadingText="Saving…"
                    >
                      Save
                    </Button>
                  </div>

                  {notionDbIdFromMeta ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Current: <span className="font-mono">{notionDbIdFromMeta}</span>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-muted-foreground">Not set yet.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </GlassSurface>
    )
  }

  return (
    <PageShell>
      <AppHeader title="Integrations" onSignOut={signOut} currentPage="integrations" />

      <div className="mx-auto w-full max-w-[720px] space-y-5">
        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-foreground/80" aria-hidden="true" />
              <div className="text-sm font-semibold text-foreground/90">Connect providers</div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Syncing is async and resilient; actions enqueue jobs and a background runner pushes them to providers.
            </div>
          </div>
        </GlassSurface>

        <Card
          provider="google"
          title="Connect Google Calendar"
          description="Create/update calendar events for tasks and plans."
          icon={<CalendarDays className="h-4 w-4 text-foreground/80" aria-hidden="true" />}
        />

        <Card
          provider="notion"
          title="Connect Notion"
          description="Create pages in your Notion database."
          icon={<NotepadText className="h-4 w-4 text-foreground/80" aria-hidden="true" />}
        />

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : null}
      </div>
    </PageShell>
  )
}

