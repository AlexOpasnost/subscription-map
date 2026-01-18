"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import PageShell from "@/components/PageShell"
import HeaderBar from "@/components/HeaderBar"
import SubscriptionCard from "@/components/SubscriptionCard"
import AddSubscriptionForm from "@/components/AddSubscriptionForm"
import EmptyState from "@/components/EmptyState"
import { useToast } from "@/components/ToastProvider"
import { humanizeError, withTimeout } from "@/lib/humanizeError"
import { consumeSignedInToast } from "@/lib/authToast"
import { daysUntilYyyyMmDd, formatRenewalCountdown } from "@/lib/renewals"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

interface Subscription {
  id: string
  service: string
  plan: string | null
  price_cents: number
  period: "monthly" | "yearly"
  category: string
  cancelled: boolean
  renewal_date: string | null
  reminder_days: number
  created_at: string
}

export default function AppPage() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    if (consumeSignedInToast()) {
      toast({ title: "Signed in", variant: "success" })
    }
  }, [toast])

  const loadSubscriptions = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    setLoadError("")
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("subscriptions")
          .select("id,service,plan,price_cents,period,category,cancelled,renewal_date,reminder_days,created_at")
          .order("created_at", { ascending: false })
      )

      if (error) {
        if (process.env.NODE_ENV !== "production") console.error(error)
        const msg = humanizeError(error)
        setLoadError(msg)
        toast({
          title: "Couldn’t load subscriptions",
          description: msg,
          variant: "error",
        })
        return
      }
      setSubscriptions(data || [])
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== "production") console.error(error)
      const msg = humanizeError(error)
      setLoadError(msg)
      toast({
        title: "Couldn’t load subscriptions",
        description: msg,
        variant: "error",
      })
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!user) return
    loadSubscriptions()
  }, [user, loadSubscriptions])

  const activeSubscriptions = subscriptions.filter((sub) => !sub.cancelled)

  const totalMonthly = activeSubscriptions.reduce((sum, sub) => {
    const price = sub.price_cents / 100
    if (sub.period === "monthly") {
      return sum + price
    } else {
      return sum + price / 12
    }
  }, 0)

  const totalYearly = activeSubscriptions.reduce((sum, sub) => {
    const price = sub.price_cents / 100
    if (sub.period === "yearly") {
      return sum + price
    } else {
      return sum + price * 12
    }
  }, 0)

  if (loading) {
    return (
      <PageShell>
        <HeaderBar title="Subscriptions" onSignOut={signOut} currentPage="subscriptions" />
        <div className="space-y-6">
          <Card className="rounded-2xl shadow-sm border bg-card">
            <CardContent className="p-6 sm:p-8">
              <div className="space-y-3 text-center">
                <Skeleton className="h-4 w-24 mx-auto" />
                <Skeleton className="h-12 w-40 mx-auto" />
                <Skeleton className="h-5 w-28 mx-auto" />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="rounded-2xl shadow-sm border bg-card">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2 flex-1 min-w-0">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <div className="space-y-2 text-right shrink-0">
                        <Skeleton className="h-6 w-20 ml-auto" />
                        <Skeleton className="h-3 w-10 ml-auto" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-28" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <HeaderBar title="Subscriptions" onSignOut={signOut} currentPage="subscriptions" />
      
      <div className="space-y-6">
        {loadError && subscriptions.length > 0 ? (
          <Card className="rounded-2xl shadow-sm border bg-card">
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-2">
                <div className="text-sm font-semibold">We couldn’t load your subscriptions</div>
                <div className="text-sm text-muted-foreground">{loadError}</div>
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!user) return
                      loadSubscriptions()
                    }}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {loadError && subscriptions.length === 0 ? (
          <EmptyState
            title="We couldn’t load your subscriptions"
            description={`${loadError} Try again in a moment.`}
            ctaLabel="Try again"
            onCtaClick={() => {
              if (!user) return
              loadSubscriptions()
            }}
          />
        ) : null}

        {(() => {
          if (loadError && subscriptions.length === 0) return null
          const upcoming = subscriptions
            .filter((s) => !s.cancelled && !!s.renewal_date)
            .map((s) => {
              const daysUntil = s.renewal_date ? daysUntilYyyyMmDd(s.renewal_date) : null
              return { sub: s, daysUntil }
            })
            .filter((x) => x.daysUntil !== null && (x.daysUntil as number) >= 0)
            .sort((a, b) => (a.daysUntil as number) - (b.daysUntil as number))
            .slice(0, 3)

          if (upcoming.length === 0) return null

          return (
            <Card className="rounded-2xl shadow-sm border bg-card">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-sm font-semibold">Upcoming renewals</div>
                    <div className="text-xs text-muted-foreground">Next 3 renewals based on your dates.</div>
                  </div>
                </div>
                <div className="space-y-3">
                  {upcoming.map(({ sub, daysUntil }) => (
                    <div key={sub.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{sub.service}</div>
                        <div className="text-xs text-muted-foreground">
                          {sub.renewal_date} • {formatRenewalCountdown(daysUntil as number)}
                        </div>
                      </div>
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link href={`/app/subscription/${sub.id}`}>Manage</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })()}

        {loadError && subscriptions.length === 0 ? null : (
          <Card className="rounded-2xl shadow-sm border bg-card">
            <CardContent className="p-6 sm:p-8 text-center">
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">You spend</p>
                <div className="text-4xl sm:text-5xl font-bold tracking-tight tabular-nums">
                  ${totalMonthly.toFixed(2)}
                </div>
                <p className="text-base sm:text-lg text-muted-foreground">
                  ${totalYearly.toFixed(0)} / year
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {subscriptions.length === 0 && !loadError ? (
          <>
            <EmptyState
              title="Get started with Subscription Map"
              description="Track and manage all your recurring subscriptions in one place."
              bullets={[
                "Track recurring spending",
                "See total monthly and yearly costs",
                "Open cancel links directly"
              ]}
              ctaLabel="Add your first subscription"
              onCtaClick={() => setFormOpen(true)}
            />
            <AddSubscriptionForm
              onSuccess={(created) => {
                if (created) {
                  setSubscriptions((prev) => [created, ...prev])
                }
                // Reconcile in background (e.g. triggers, RLS, defaults) without blocking UI.
                loadSubscriptions({ silent: true })
                setFormOpen(false)
              }}
              defaultOpen={formOpen}
            />
          </>
        ) : loadError && subscriptions.length === 0 ? null : (
          <>
            <AddSubscriptionForm
              onSuccess={(created) => {
                if (created) {
                  setSubscriptions((prev) => [created, ...prev])
                }
                loadSubscriptions({ silent: true })
              }}
            />
            
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <SubscriptionCard
                  key={sub.id}
                  id={sub.id}
                  service={sub.service}
                  plan={sub.plan}
                  price_cents={sub.price_cents}
                  period={sub.period}
                  category={sub.category}
                  cancelled={sub.cancelled}
                  renewal_date={sub.renewal_date}
                  reminder_days={sub.reminder_days}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
