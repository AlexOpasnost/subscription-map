"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import PageShell from "@/components/PageShell"
import AppHeader from "@/components/AppHeader"
import { GlassSurface } from "@/components/ui/GlassSurface"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/lib/supabase/auth"
import { useToast } from "@/components/ToastProvider"
import { humanizeError } from "@/lib/humanizeError"

type Settings = {
  inapp_enabled: boolean
  email_enabled: boolean
  email_address: string | null
  default_lead_minutes: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export default function NotificationsSettingsPage() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    inapp_enabled: true,
    email_enabled: false,
    email_address: null,
    default_lead_minutes: 1440,
  })

  const leadDays = useMemo(() => {
    const d = Math.round((settings.default_lead_minutes || 0) / 1440)
    return d > 0 ? d : 1
  }, [settings.default_lead_minutes])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await fetch("/api/notifications/settings", { method: "GET", credentials: "include" })
      const json: unknown = await res.json()
      if (!res.ok) throw new Error(isRecord(json) && typeof json.error === "string" ? json.error : `HTTP ${res.status}`)
      const s = isRecord(json) && isRecord(json.settings) ? (json.settings as any) : {}
      setSettings({
        inapp_enabled: Boolean(s.inapp_enabled ?? true),
        email_enabled: Boolean(s.email_enabled ?? false),
        email_address: typeof s.email_address === "string" ? s.email_address : null,
        default_lead_minutes: typeof s.default_lead_minutes === "number" ? s.default_lead_minutes : 1440,
      })
    } catch (err: unknown) {
      toast({ title: "Couldn’t load settings", description: humanizeError(err), variant: "error" })
    } finally {
      setLoading(false)
    }
  }, [toast, user])

  useEffect(() => {
    if (!user) return
    load()
  }, [user, load])

  const save = useCallback(async () => {
    if (!user) return
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/notifications/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inapp_enabled: settings.inapp_enabled,
          email_enabled: settings.email_enabled,
          email_address: settings.email_address,
          lead_days: leadDays,
        }),
      })
      const json: unknown = await res.json()
      if (!res.ok || !(isRecord(json) && json.ok === true)) {
        throw new Error(isRecord(json) && typeof json.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      toast({ title: "Saved", variant: "success" })
      await load()
    } catch (err: unknown) {
      toast({ title: "Couldn’t save", description: humanizeError(err), variant: "error" })
    } finally {
      setSaving(false)
    }
  }, [leadDays, load, saving, settings.email_address, settings.email_enabled, settings.inapp_enabled, toast, user])

  return (
    <PageShell>
      <AppHeader title="Notification settings" onSignOut={signOut} currentPage="settings" />

      <div className="mx-auto w-full max-w-[720px] space-y-5">
        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8 space-y-5">
            <div className="text-sm font-semibold text-foreground/90">Delivery</div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-sm text-foreground/85">In-app notifications</div>
              <Checkbox
                checked={settings.inapp_enabled}
                onChange={() => setSettings((s) => ({ ...s, inapp_enabled: !s.inapp_enabled }))}
                label=""
                disabled={loading}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-foreground/85">Email notifications</div>
                <Checkbox
                  checked={settings.email_enabled}
                  onChange={() => setSettings((s) => ({ ...s, email_enabled: !s.email_enabled }))}
                  label=""
                  disabled={loading}
                />
              </div>
              <Input
                placeholder="Email address (optional)"
                value={settings.email_address ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, email_address: e.target.value.trim() || null }))}
                disabled={loading}
              />
              <div className="text-xs text-muted-foreground">If empty, email delivery is skipped.</div>
            </div>

            <div className="text-sm font-semibold text-foreground/90">Reminder lead time</div>
            <div className="flex flex-wrap gap-2">
              {[1, 3, 7].map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant={leadDays === d ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setSettings((s) => ({ ...s, default_lead_minutes: d * 1440 }))}
                  disabled={loading}
                >
                  {d} day{d === 1 ? "" : "s"}
                </Button>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="button" variant="primary" onClick={save} disabled={!user || loading || saving}>
                Save
              </Button>
            </div>
          </div>
        </GlassSurface>
      </div>
    </PageShell>
  )
}

