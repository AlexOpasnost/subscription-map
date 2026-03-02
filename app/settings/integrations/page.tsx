"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { NotepadText, Plug, ShieldAlert } from "lucide-react"

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

type Provider = "notion"

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
  const [status, setStatus] = useState<{
    ok?: boolean
    connected: { notion: boolean }
    notion: { databaseId: string }
  } | null>(null)

  function apiError(json: unknown, res: Response): string {
    if (isRecord(json) && typeof json.error === "string" && json.error.trim()) return json.error
    return `HTTP ${res.status}`
  }

  function isStatusPayload(v: unknown): v is NonNullable<typeof status> {
    if (!isRecord(v)) return false
    if (!isRecord(v.connected)) return false
    if (typeof v.connected.notion !== "boolean") return false
    if (!isRecord(v.notion)) return false
    if (typeof v.notion.databaseId !== "string") return false
    return true
  }

  const providers = useMemo(() => {
    return {
      notion: !!status?.connected.notion,
    }
  }, [status?.connected.notion])

  const load = async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await fetch("/api/integrations/status", { credentials: "include" })
      const json: unknown = await res.json()
      if (!res.ok || !(isRecord(json) && json.ok === true) || !isStatusPayload(json)) throw new Error(apiError(json, res))
      setStatus(json)
      setNotionDatabaseId(json.notion.databaseId)
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

    if (connected === "notion") {
      toast({ title: "Connected", description: "Connected Notion.", variant: "success" })
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
      toast({ title: "Notion setup", description: "Paste your Notion token + database ID below.", variant: "success" })
    } catch (err: unknown) {
      const raw = humanizeError(err)
      toast({
        title: "Couldn’t start OAuth",
        description: raw,
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
      const res = await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider }),
      })
      const json: unknown = await res.json()
      if (!res.ok || !(isRecord(json) && json.ok === true)) throw new Error(apiError(json, res))
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
      const res = await fetch("/api/integrations/notion/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: tok, databaseId: dbId }),
      })
      const json: unknown = await res.json()
      if (!res.ok || !(isRecord(json) && json.ok === true)) throw new Error(apiError(json, res))

      toast({ title: "Connected", description: "Notion settings saved.", variant: "success" })
      setNotionToken("")
      await load()
    } catch (err: unknown) {
      toast({ title: "Couldn’t save Notion settings", description: humanizeError(err), variant: "error" })
    } finally {
      setSavingNotion(false)
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
              Notifications are internal (in-app + email). Notion is optional.
            </div>
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
                    <span className="font-mono">RESEND_API_KEY</span>,{" "}
                    <span className="font-mono">EMAIL_FROM</span>,{" "}
                    <span className="font-mono">NOTIFICATIONS_RUN_SECRET</span>,{" "}
                    <span className="font-mono">NOTION_CLIENT_ID</span>,{" "}
                    <span className="font-mono">NOTION_CLIENT_SECRET</span>.
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </GlassSurface>

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

