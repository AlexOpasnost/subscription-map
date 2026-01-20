"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { DatePicker } from "@/components/ui/date-picker"
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
          <Card className="rounded-2xl shadow-sm border bg-card">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-12 w-40 mx-auto" />
              <Skeleton className="h-4 w-28 mx-auto" />
              <Skeleton className="h-4 w-32 mx-auto" />
              <div className="pt-4 border-t space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm border bg-card">
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        </div>
      </PageShell>
    )
  }

  if (!subscription) {
    return (
      <PageShell>
        <AppHeader title="Subscription" onSignOut={signOut} currentPage="detail" />
        <Card className="rounded-2xl shadow-sm border bg-card">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">Subscription not found.</p>
            <Button onClick={() => router.push("/app")} className="w-full sm:w-auto">
              Back to Subscriptions
            </Button>
          </CardContent>
        </Card>
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

  return (
    <PageShell>
      <AppHeader title={subscription.service} onSignOut={signOut} currentPage="detail" />
      
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/app")}
          className="w-full sm:w-auto -ml-2 sm:ml-0"
          size="sm"
        >
          ← Back
        </Button>

        <Card className="rounded-2xl shadow-sm border bg-card">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-2">
              <div className="text-4xl sm:text-5xl font-bold tracking-tight tabular-nums mb-1">
                ${monthlyPrice.toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">per month</div>
              <div className="text-base text-muted-foreground mt-2">
                ${yearlyPrice.toFixed(2)} per year
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Billing Period</span>
                <span className="text-sm font-medium capitalize">{subscription.period}</span>
              </div>
              {subscription.plan && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Plan</span>
                  <span className="text-sm font-medium">{subscription.plan}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Category</span>
                <span className="text-sm font-medium">{displayCategory}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm font-medium text-muted-foreground">Status</span>
                <Badge
                  variant={subscription.cancelled ? "secondary" : "success"}
                  className="text-xs"
                >
                  {subscription.cancelled ? "Cancelled" : "Active"}
                </Badge>
              </div>

              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-[color:var(--accent)]">Info only:</span> This service is often cheaper in{" "}
                  <span className="text-foreground">{cheaperRegions.join(", ")}</span>. Pricing varies by region and can change.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm border bg-card">
          <CardHeader>
            <CardTitle>Renewal & reminders</CardTitle>
            <CardDescription>Stay ahead of renewals. No automation—just helpful reminders.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="renewal-date">Next renewal</Label>
                <DatePicker
                  id="renewal-date"
                  value={renewalDate}
                  onChange={(next) => setRenewalDate(next ?? "")}
                  disabled={savingHelper}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reminder-days">Reminder</Label>
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
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Anything you want to remember…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={savingHelper}
                />
              </div>
            </div>

            <Button onClick={handleSaveHelper} loading={savingHelper} loadingText="Saving…" className="w-full">
              Save
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm border bg-card">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Manage your subscription</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <p className="text-xs text-muted-foreground">
                You can cancel anytime on the official page.
              </p>
              {!hasCancelUrl && (
                <p className="text-xs text-muted-foreground">
                  No cancel link available
                </p>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5 flex-1">
                <label className="text-sm font-medium cursor-pointer" htmlFor="pause-toggle">
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
              className="w-full"
              loading={deleting}
              loadingText="Deleting…"
            >
              Delete subscription
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
