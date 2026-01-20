"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import { subscriptionCatalog } from "@/lib/subscriptionCatalog"
import PageShell from "@/components/PageShell"
import AppHeader from "@/components/AppHeader"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ToastProvider"
import { humanizeError, withTimeout } from "@/lib/humanizeError"
import { getCheaperRegions } from "@/lib/priceComparison"
import { GlassSurface } from "@/components/ui/GlassSurface"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { CalendarDays, X } from "lucide-react"

interface Subscription {
  id: string
  service: string
  plan: string | null
  price_cents: number
  period: "monthly" | "yearly"
  category: string
  cancelled: boolean
  cancel_url: string | null
  renewal_date: string | null
  reminder_days: number
  notes: string | null
  created_at: string
}

function normalizeIsoYyyyMmDd(value: string | null | undefined): string {
  const s = (value ?? "").trim()
  if (!s) return ""
  // If Supabase ever returns an ISO timestamp (e.g. 2026-01-01T00:00:00.000Z),
  // normalize it to YYYY-MM-DD for the native date input.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return m ? m[1] : ""
}

function formatDisplayDateEnUs(isoYyyyMmDd: string): string | null {
  const s = isoYyyyMmDd.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo, d))
  if (Number.isNaN(dt.getTime())) return null
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(dt)
}

function yyyyMmDdToLocalDate(isoYyyyMmDd: string): Date | undefined {
  const s = isoYyyyMmDd.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return undefined
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = new Date(y, mo, d)
  return Number.isNaN(dt.getTime()) ? undefined : dt
}

export default function SubscriptionDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [togglingPaused, setTogglingPaused] = useState(false)
  const [openingCancel, setOpeningCancel] = useState(false)
  const [savingHelper, setSavingHelper] = useState(false)
  const [renewalDate, setRenewalDate] = useState<string>("")
  const [reminderDays, setReminderDays] = useState<string>("3")
  const [notes, setNotes] = useState<string>("")

  useEffect(() => {
    if (!user || !params.id) return

    const loadSubscription = async () => {
      try {
        const { data, error } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("id", params.id)
          .single()

        if (error) {
          console.error(error)
          toast({
            title: "Couldn’t load subscription",
            description: humanizeError(error),
            variant: "error",
          })
          router.push("/app")
          return
        }

        setSubscription(data)
        setRenewalDate(normalizeIsoYyyyMmDd(data.renewal_date))
        setReminderDays(String((data.reminder_days ?? 3) as number))
        setNotes(data.notes ?? "")
      } catch (error: unknown) {
        console.error(error)
        toast({
          title: "Couldn’t load subscription",
          description: humanizeError(error),
          variant: "error",
        })
        router.push("/app")
      } finally {
        setLoading(false)
      }
    }

    loadSubscription()
  }, [user, params.id, router, toast])

  const handleTogglePaused = async () => {
    if (!subscription) return
    if (togglingPaused) return

    setTogglingPaused(true)
    try {
      const nextCancelled = !subscription.cancelled
      const safeCategory = (subscription.category ?? "").trim() || "Other"

      const { error } = await withTimeout(
        supabase
          .from("subscriptions")
          .update({ cancelled: nextCancelled, category: safeCategory })
          .eq("id", subscription.id)
      )

      if (error) {
        console.error(error)
        toast({
          title: "Couldn’t update subscription",
          description: humanizeError(error),
          variant: "error",
        })
        return
      }

      setSubscription({ ...subscription, cancelled: nextCancelled })
      toast({
        title: nextCancelled ? "Marked as cancelled" : "Marked as active",
        variant: "success",
      })
    } catch (error: unknown) {
      console.error(error)
      toast({
        title: "Couldn’t update subscription",
        description: humanizeError(error),
        variant: "error",
      })
    } finally {
      setTogglingPaused(false)
    }
  }

  const handleOpenCancelPage = () => {
    if (!subscription) return
    if (openingCancel) return

    const catalogService = subscriptionCatalog.find(
      (service) => service.serviceName === subscription.service
    )
    const cancelUrl = subscription.cancel_url || catalogService?.cancelUrl

    if (!cancelUrl) {
      toast({ title: "No official cancel page found", variant: "error" })
      return
    }

    setOpeningCancel(true)
    try {
      window.open(cancelUrl, "_blank", "noopener,noreferrer")
      toast({ title: "Opening official cancel page", variant: "success" })
    } finally {
      setOpeningCancel(false)
    }
  }

  const handleSaveHelper = async () => {
    if (!subscription) return
    if (savingHelper) return

    const reminder = Number(reminderDays)
    if (![1, 3, 7, 14].includes(reminder)) {
      toast({ title: "Invalid reminder days", variant: "error" })
      return
    }

    setSavingHelper(true)
    try {
      const safeCategory = (subscription.category ?? "").trim() || "Other"
      const { error } = await withTimeout(
        supabase
          .from("subscriptions")
          .update({
            renewal_date: renewalDate || null,
            reminder_days: reminder,
            notes: notes.trim() ? notes : null,
            category: safeCategory,
          })
          .eq("id", subscription.id)
      )

      if (error) {
        console.error(error)
        toast({
          title: "Couldn’t save changes",
          description: humanizeError(error),
          variant: "error",
        })
        return
      }

      setSubscription({
        ...subscription,
        renewal_date: renewalDate || null,
        reminder_days: reminder,
        notes: notes.trim() ? notes : null,
      })

      toast({ title: "Saved", variant: "success" })
    } catch (error: unknown) {
      console.error(error)
      toast({
        title: "Couldn’t save changes",
        description: humanizeError(error),
        variant: "error",
      })
    } finally {
      setSavingHelper(false)
    }
  }

  const handleDelete = async () => {
    if (!subscription) return
    if (deleting) return

    if (!confirm(`Delete ${subscription.service}? This cannot be undone.`)) {
      return
    }

    setDeleting(true)
    try {
      const { error } = await withTimeout(
        supabase.from("subscriptions").delete().eq("id", subscription.id)
      )

      if (error) {
        console.error(error)
        toast({
          title: "Couldn’t delete subscription",
          description: humanizeError(error),
          variant: "error",
        })
        return
      }

      toast({ title: "Subscription deleted", variant: "success" })
      router.push("/app")
    } catch (error: unknown) {
      console.error(error)
      toast({
        title: "Couldn’t delete subscription",
        description: humanizeError(error),
        variant: "error",
      })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <PageShell>
        <AppHeader title="Subscription" onSignOut={signOut} currentPage="detail" />
        <div className="space-y-6">
          <GlassSurface variant="subtle" className="p-0">
            <div className="px-6 py-6">
              <div className="text-sm font-semibold text-foreground/90">Details</div>
              <div className="mt-4 space-y-3">
              <Skeleton className="h-12 w-40 mx-auto" />
              <Skeleton className="h-4 w-28 mx-auto" />
              <Skeleton className="h-4 w-32 mx-auto" />
              <div className="pt-4 border-t space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              </div>
            </div>
          </GlassSurface>
          <GlassSurface variant="subtle" className="p-0">
            <div className="px-6 py-6">
              <div className="text-sm font-semibold text-foreground/90">Actions</div>
              <div className="mt-4 space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-9 w-full" />
              </div>
            </div>
          </GlassSurface>
        </div>
      </PageShell>
    )
  }

  if (!subscription) {
    return (
      <PageShell>
        <AppHeader title="Subscription" onSignOut={signOut} currentPage="detail" />
        <GlassSurface variant="subtle" className="p-0">
          <div className="py-12 text-center px-6">
            <p className="text-muted-foreground mb-4">Subscription not found.</p>
            <Button onClick={() => router.push("/app")} variant="outline" className="w-full sm:w-auto">
              Back to Subscriptions
            </Button>
          </div>
        </GlassSurface>
      </PageShell>
    )
  }

  const price = subscription.price_cents / 100
  const monthlyPrice = subscription.period === "monthly" ? price : price / 12
  const yearlyPrice = subscription.period === "yearly" ? price : price * 12

  const catalogService = subscriptionCatalog.find(
    (service) => service.serviceName === subscription.service
  )
  const hasCancelUrl = !!(subscription.cancel_url || catalogService?.cancelUrl)

  // Sanitize category for display
  const displayCategory = subscription.category?.trim() || "—"
  const cheaperRegions = getCheaperRegions(subscription.service)
  const selectedRenewalDate = renewalDate ? yyyyMmDdToLocalDate(renewalDate) : undefined

  return (
    <PageShell>
      <AppHeader title={subscription.service} onSignOut={signOut} currentPage="detail" />
      
      <div className="mx-auto w-full max-w-[720px] space-y-5">
        <Button
          variant="ghost"
          onClick={() => router.push("/app")}
          className="w-full sm:w-auto -ml-2 sm:ml-0"
          size="sm"
        >
          ← Back
        </Button>

        <GlassSurface className="p-0">
          <div className="p-6 sm:p-8">
            <div className="text-center py-1">
              <div className="text-5xl sm:text-6xl font-semibold tracking-tight tabular-nums text-foreground/95">
                ${monthlyPrice.toFixed(2)}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">per month</div>
              <div className="mt-2 text-sm text-muted-foreground">${yearlyPrice.toFixed(2)} per year</div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  variant="secondary"
                  className={subscription.cancelled ? "text-xs bg-white/3 border-white/8 text-muted-foreground" : "text-xs bg-white/5 border-white/10 text-foreground/80"}
                >
                  {subscription.cancelled ? "Cancelled" : "Active"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-white/8">
                <div className="flex items-center justify-between sm:block">
                  <div className="text-xs text-muted-foreground">Billing period</div>
                  <div className="mt-1 text-sm font-medium capitalize text-foreground/90">{subscription.period}</div>
                </div>
                <div className="flex items-center justify-between sm:block">
                  <div className="text-xs text-muted-foreground">Category</div>
                  <div className="mt-1 text-sm font-medium text-foreground/90">{displayCategory}</div>
                </div>
                {subscription.plan ? (
                  <div className="flex items-center justify-between sm:block">
                    <div className="text-xs text-muted-foreground">Plan</div>
                    <div className="mt-1 text-sm font-medium text-foreground/90">{subscription.plan}</div>
                  </div>
                ) : null}
              </div>

              {cheaperRegions.length > 0 ? (
                <div className="pt-4 border-t border-white/8">
                  <div className="text-xs text-muted-foreground">
                    Pricing can vary by region; this service is often cheaper in{" "}
                    <span className="text-foreground/90">{cheaperRegions.join(", ")}</span>.
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </GlassSurface>

        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-semibold text-foreground/90">Renewal & reminders</div>
              <div className="text-xs text-muted-foreground">Utility settings</div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="renewal-date" className="text-foreground/80">
                  Next renewal
                </Label>

                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        id="renewal-date"
                        type="button"
                        disabled={savingHelper}
                        className="h-10 w-full flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 text-left text-sm text-foreground/90 shadow-xs transition-[color,box-shadow,background-color,border-color] outline-none hover:bg-white/6 focus-visible:border-[color:var(--accent)] focus-visible:ring-[color:var(--accent)]/25 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
                      >
                        <span className={renewalDate ? "text-foreground/90" : "text-muted-foreground"}>
                          {renewalDate ? (formatDisplayDateEnUs(renewalDate) ?? renewalDate) : "Pick a date"}
                        </span>
                        <CalendarDays className="size-4 opacity-70" aria-hidden="true" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
                      collisionPadding={12}
                      className="w-[340px] sm:w-[360px] p-0 overflow-hidden"
                    >
                      <div className="p-3 min-h-[320px]">
                        <Calendar
                          className="w-full"
                          fixedWeeks
                          mode="single"
                          selected={selectedRenewalDate}
                          onSelect={(date) => setRenewalDate(date ? format(date, "yyyy-MM-dd") : "")}
                          initialFocus
                        />
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setRenewalDate("")}
                    disabled={!renewalDate || savingHelper}
                    className="shrink-0"
                    aria-label="Clear renewal date"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>

                {renewalDate ? (
                  <div className="text-xs text-muted-foreground">{formatDisplayDateEnUs(renewalDate) ?? renewalDate}</div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reminder-days" className="text-foreground/80">
                  Reminder
                </Label>
                <Select value={reminderDays} onValueChange={setReminderDays}>
                  <SelectTrigger id="reminder-days" disabled={savingHelper}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day before</SelectItem>
                    <SelectItem value="3">3 days before</SelectItem>
                    <SelectItem value="7">7 days before</SelectItem>
                    <SelectItem value="14">14 days before</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes" className="text-foreground/80">
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Anything you want to remember…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={savingHelper}
                />
              </div>
            </div>

            <div className="mt-5">
              <Button
                onClick={handleSaveHelper}
                loading={savingHelper}
                loadingText="Saving…"
                variant="primary"
                className="w-full h-11 text-[15px] font-semibold tracking-tight"
              >
                Save
              </Button>
            </div>
          </div>
        </GlassSurface>

        <GlassSurface variant="subtle" className="p-0">
          <div className="p-6 sm:p-8">
            <div className="text-sm font-semibold text-foreground/90">Actions</div>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={handleOpenCancelPage}
                  disabled={!hasCancelUrl || openingCancel}
                  className="w-full"
                  loading={openingCancel}
                  loadingText="Opening…"
                >
                  Open official cancel page
                </Button>
                <p className="text-xs text-muted-foreground">You can cancel anytime on the official page.</p>
                {!hasCancelUrl ? <p className="text-xs text-muted-foreground">No cancel link available</p> : null}
              </div>

              <div className="flex items-center justify-between gap-3 p-4 rounded-[20px] border border-white/10 bg-white/5">
                <div className="space-y-0.5 flex-1">
                  <label className="text-sm font-medium cursor-pointer text-foreground/90" htmlFor="pause-toggle">
                    Mark as cancelled
                  </label>
                  <p className="text-xs text-muted-foreground">
                    This is for your tracking only. It doesn’t cancel anything automatically.
                  </p>
                </div>
                <Checkbox
                  id="pause-toggle"
                  checked={subscription.cancelled || false}
                  onChange={handleTogglePaused}
                  label=""
                  disabled={togglingPaused}
                />
              </div>

              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="w-full h-11 text-[15px] font-semibold tracking-tight"
                loading={deleting}
                loadingText="Deleting…"
              >
                Delete subscription
              </Button>
            </div>
          </div>
        </GlassSurface>
      </div>
    </PageShell>
  )
}
