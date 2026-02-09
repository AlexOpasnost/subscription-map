"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, NotepadText, Plug, ShieldAlert } from "lucide-react"

import PageShell from "@/components/PageShell"
import AppHeader from "@/components/AppHeader"
import { GlassSurface } from "@/components/ui/GlassSurface"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ToastProvider"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import { humanizeError } from "@/lib/humanizeError"

type Provider = "google" | "notion"

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
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null)
  const [notionToken, setNotionToken] = useState("")
  const [notionDatabaseId, setNotionDatabaseId] = useState("")
  const [savingNotion, setSavingNotion] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [status, setStatus] = useState<{
    connected: { google: boolean; notion: boolean }
    settings: { tasks: boolean; subscriptions: boolean; birthdays: boolean }
    notion: { databaseId: string }
    google?: { status?: string; scopes?: string[] }
    lastSync: {
      google: { status: string; last_error: string | null; updated_at: string } | null
      notion: { status: string; last_error: string | null; updated_at: string } | null
    }
  } | null>(null)

  const providers = useMemo(() => {
    return {
      google: !!status?.connected.google,
      notion: !!status?.connected.notion,
    }
  }, [status?.connected.google, status?.connected.notion])

  const load = async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("You’re signed out. Please sign in again.")

      const res = await fetch("/api/integrations/status", { headers: { Authorization: `Bearer ${token}` } })
      const json = (await res.json()) as any
      if (!res.ok || !json.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      // Optional: augment with Google connection status/scopes (non-blocking).
      try {
        const gRes = await fetch("/api/integrations/google/status", { headers: { Authorization: `Bearer ${token}` } })
        const gJson = (await gRes.json()) as any
        if (gRes.ok && gJson?.ok) {
          json.google = { status: gJson.status, scopes: Array.isArray(gJson.scopes) ? gJson.scopes : [] }
        }
      } catch {
        // ignore
      }
      setStatus(json)
      setNotionDatabaseId(typeof json?.notion?.databaseId === "string" ? json.notion.databaseId : "")
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

  function friendlyGoogleError(msg: string): string {
    const s = msg.toLowerCase()
    if (s.includes("access_denied")) {
      return "Google OAuth was denied. If your app is in Testing mode, add your account as a Test user in Google Cloud."
    }
    if (s.includes("invalid_client")) {
      return "Google OAuth client is misconfigured. Verify GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET and the redirect URL in Google Cloud."
    }
    if (s.includes("workspace") || s.includes("admin")) {
      return "Your Google Workspace admin may be blocking OAuth apps. Try a personal account or ask your admin to allow it."
    }
    return msg
  }

  const startConnect = async (provider: Provider) => {
    if (!user) return
    if (busyProvider) return
    setBusyProvider(provider)
    try {
      if (provider === "google") {
        // Start OAuth server-side (keeps userId tied to the current session).
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) throw new Error("You’re signed out. Please sign in again.")

        const res = await fetch("/api/integrations/google/start", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = (await res.json()) as any
        if (!res.ok || typeof json?.url !== "string" || !json.url) {
          const msg = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`
          throw new Error(msg)
        }
        window.location.href = json.url
        return
      }
      // Notion uses token+database connect below.
      toast({ title: "Notion setup", description: "Paste your Notion token + database ID below.", variant: "success" })
    } catch (err: unknown) {
      const raw = humanizeError(err)
      toast({
        title: "Couldn’t start OAuth",
        description: provider === "google" ? friendlyGoogleError(raw) : raw,
        variant: "error",
      })
    } finally {
      setBusyProvider(null)
    }
  }

  const disconnect = async (provider: Provider) => {
    if (!user) return
    if (busyProvider) return
    setBusyProvider(provider)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("You’re signed out. Please sign in again.")

      const res = await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider }),
      })
      const json = (await res.json()) as any
      if (!res.ok || !json.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      toast({ title: "Disconnected", variant: "success" })
      await load()
    } catch (err: unknown) {
      toast({ title: "Couldn’t disconnect", description: humanizeError(err), variant: "error" })
    } finally {
      setBusyProvider(null)
    }
  }

  const saveNotion = async () => {
    if (!user) return
    if (savingNotion) return
    const dbId = notionDatabaseId.trim()
    const tok = notionToken.trim()
    if (!tok) {
      toast({ title: "Notion token required", description: "Paste a Notion integration token.", variant: "error" })
      return
    }
    if (!dbId) {
      toast({ title: "Database ID required", description: "Paste a Notion database ID.", variant: "error" })
      return
    }
    setSavingNotion(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("You’re signed out. Please sign in again.")

      const res = await fetch("/api/integrations/notion/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token: tok, databaseId: dbId }),
      })
      const json = (await res.json()) as any
      if (!res.ok || !json.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)

      toast({ title: "Connected", description: "Notion settings saved.", variant: "success" })
      setNotionToken("")
      await load()
    } catch (err: unknown) {
      toast({ title: "Couldn’t save Notion settings", description: humanizeError(err), variant: "error" })
    } finally {
      setSavingNotion(false)
    }
  }

  const saveSyncSettings = async () => {
    if (!user) return
    if (settingsSaving) return
    if (!status) return
    setSettingsSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("You’re signed out. Please sign in again.")
      const res = await fetch("/api/integrations/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sync: status.settings }),
      })
      const json = (await res.json()) as any
      if (!res.ok || !json.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      toast({ title: "Saved", description: "Sync preferences updated.", variant: "success" })
      await load()
    } catch (err: unknown) {
      toast({ title: "Couldn’t save preferences", description: humanizeError(err), variant: "error" })
    } finally {
      setSettingsSaving(false)
    }
  }

  const retrySync = async () => {
    if (!user) return
    if (retrying) return
    setRetrying(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("You’re signed out. Please sign in again.")
      const res = await fetch("/api/sync/run", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      const json = (await res.json()) as any
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      toast({ title: "Sync run started", description: `Processed ${json.processed ?? 0} jobs.`, variant: "success" })
      await load()
    } catch (err: unknown) {
      toast({ title: "Sync failed", description: humanizeError(err), variant: "error" })
    } finally {
      setRetrying(false)
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
    const last = status?.lastSync?.[provider] ?? null
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
              {provider === "google" && connected && status?.google?.scopes && status.google.scopes.length ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Scopes: <span className="text-foreground/80">{status.google.scopes.slice(0, 3).join(", ")}</span>
                  {status.google.scopes.length > 3 ? <span className="opacity-70"> +{status.google.scopes.length - 3} more</span> : null}
                </div>
              ) : null}
              {last ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Last sync: <span className="text-foreground/80">{last.status}</span>{" "}
                  <span className="opacity-70">({new Date(last.updated_at).toLocaleString()})</span>
                  {last.last_error ? <div className="mt-1 text-destructive">{last.last_error}</div> : null}
                </div>
              ) : null}
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

          {provider === "notion" ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-xl border border-white/10 bg-white/5 shrink-0">
                  <ShieldAlert className="h-3.5 w-3.5 text-foreground/80" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground/90">Notion database + token</div>
                  <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Paste a Notion integration token and a database ID. The token is saved server-side and never returned to the client.
                  </div>

                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <Input
                      value={notionToken}
                      onChange={(e) => setNotionToken(e.target.value)}
                      placeholder="notion_token"
                      type="password"
                      disabled={savingNotion}
                    />
                    <Input
                      value={notionDatabaseId}
                      onChange={(e) => setNotionDatabaseId(e.target.value)}
                      placeholder="notion_database_id"
                      disabled={savingNotion}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={saveNotion}
                      disabled={savingNotion || !notionDatabaseId.trim() || !notionToken.trim()}
                      className="h-10"
                      loading={savingNotion}
                      loadingText="Validating…"
                    >
                      Save
                    </Button>
                  </div>

                  {status?.notion?.databaseId ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Current: <span className="font-mono">{status.notion.databaseId}</span>
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

        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground/90">Sync preferences</div>
                <div className="mt-1 text-xs text-muted-foreground">Applies to both Google and Notion (when connected).</div>
              </div>
              <div className="shrink-0 flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={retrySync} disabled={retrying || loading}>
                  Retry sync
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={saveSyncSettings}
                  disabled={settingsSaving || loading || !status}
                  loading={settingsSaving}
                  loadingText="Saving…"
                >
                  Save
                </Button>
              </div>
            </div>

            {status ? (
              <div className="mt-4 grid gap-3">
                {(
                  [
                    { key: "tasks", label: "Sync Tasks" },
                    { key: "subscriptions", label: "Sync Subscriptions (renewals)" },
                    { key: "birthdays", label: "Sync Birthdays" },
                  ] as const
                ).map((x) => (
                  <div key={x.key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-sm text-foreground/90">{x.label}</div>
                    <Checkbox
                      checked={Boolean((status.settings as any)[x.key])}
                      onChange={() =>
                        setStatus((s) =>
                          s
                            ? {
                                ...s,
                                settings: { ...s.settings, [x.key]: !Boolean((s.settings as any)[x.key]) } as any,
                              }
                            : s
                        )
                      }
                      label=""
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">Connect a provider to configure sync.</div>
            )}
          </div>
        </GlassSurface>

        <GlassSurface variant="subtle" className="p-0">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="how-to-configure" className="border-none">
              <AccordionTrigger className="px-5 sm:px-6 py-4 hover:no-underline rounded-[24px] text-foreground/90 transition-colors hover:bg-white/5 data-[state=open]:bg-white/5">
                How to configure (env vars + redirects)
              </AccordionTrigger>
              <AccordionContent className="px-5 sm:px-6 pb-6 pt-0">
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="text-xs text-muted-foreground">
                    Required on Vercel (do not paste secrets here):{" "}
                    <span className="font-mono">APP_URL</span>,{" "}
                    <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>,{" "}
                    <span className="font-mono">GOOGLE_CLIENT_ID</span>,{" "}
                    <span className="font-mono">GOOGLE_CLIENT_SECRET</span>,{" "}
                    <span className="font-mono">NOTION_CLIENT_ID</span>,{" "}
                    <span className="font-mono">NOTION_CLIENT_SECRET</span>.
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Redirect URLs (built from <span className="font-mono">APP_URL</span>):
                    <div className="mt-2 space-y-1 font-mono text-[12px]">
                      <div>{`$APP_URL/api/integrations/google/callback`}</div>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
          description="Create pages in your Notion database (manual token setup for now)."
          icon={<NotepadText className="h-4 w-4 text-foreground/80" aria-hidden="true" />}
        />

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : null}
      </div>
    </PageShell>
  )
}

