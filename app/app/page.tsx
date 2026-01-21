"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import PageShell from "@/components/PageShell"
import AppHeader from "@/components/AppHeader"
import SubscriptionCard from "@/components/SubscriptionCard"
import AddSubscriptionForm from "@/components/AddSubscriptionForm"
import EmptyState from "@/components/EmptyState"
import { useToast } from "@/components/ToastProvider"
import { humanizeError, withTimeout } from "@/lib/humanizeError"
import { consumeSignedInToast } from "@/lib/authToast"
import { daysUntilYyyyMmDd, formatRenewalCountdown } from "@/lib/renewals"
import { formatDisplayDate } from "@/lib/formatDisplayDate"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sparkles } from "lucide-react"
import { GlassSurface } from "@/components/ui/GlassSurface"

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
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null)

  const scrollToSubscription = useCallback((id: string) => {
    if (typeof document === "undefined") return
    let tries = 0
    const run = () => {
      tries += 1
      const el =
        (document.getElementById(`subscription-${id}`) as HTMLElement | null) ??
        (document.querySelector(`[data-subscription-id="${CSS.escape(id)}"]`) as HTMLElement | null)
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }
      if (tries < 6) setTimeout(run, 120)
    }
    setTimeout(run, 60)
  }, [])

  useEffect(() => {
    if (!recentlyAddedId) return
    const t = window.setTimeout(() => setRecentlyAddedId(null), 1200)
    return () => window.clearTimeout(t)
  }, [recentlyAddedId])

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

  const handleCreatedSubscription = useCallback((created?: Subscription) => {
    if (created) {
      setSubscriptions((prev) => [created, ...prev])
      setRecentlyAddedId(created.id)
      scrollToSubscription(created.id)
    }
    // Reconcile in background (e.g. triggers, RLS, defaults) without blocking UI.
    loadSubscriptions({ silent: true })
    setFormOpen(false)
  }, [loadSubscriptions, scrollToSubscription])

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
        <AppHeader title="Subscriptions" onSignOut={signOut} currentPage="subscriptions" />
        <div className="mx-auto w-full max-w-[720px] space-y-5">
          <GlassSurface>
            <div className="p-6 sm:p-8 text-center">
              <div className="space-y-4">
                <Skeleton className="h-4 w-20 mx-auto opacity-60" />
                <Skeleton className="h-14 w-44 mx-auto opacity-70" />
                <Skeleton className="h-5 w-28 mx-auto opacity-60" />
              </div>
            </div>
          </GlassSurface>

          <GlassSurface variant="subtle">
            <div className="p-4 sm:p-5">
              <Skeleton className="h-10 w-full opacity-60" />
            </div>
          </GlassSurface>

          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <GlassSurface key={i} variant="subtle">
                <div className="p-4 sm:p-5">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1 min-w-0">
                        <Skeleton className="h-5 w-48 opacity-70" />
                        <Skeleton className="h-4 w-32 opacity-60" />
                      </div>
                      <div className="space-y-2 text-right shrink-0">
                        <Skeleton className="h-7 w-20 ml-auto opacity-70" />
                        <Skeleton className="h-3 w-12 ml-auto opacity-60" />
                      </div>
                    </div>
                    <Skeleton className="h-9 w-28 opacity-60" />
                  </div>
                </div>
              </GlassSurface>
            ))}
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <AppHeader title="Subscriptions" onSignOut={signOut} currentPage="subscriptions" />

      <div className="mx-auto w-full max-w-[720px] space-y-5">

        {loadError && subscriptions.length > 0 ? (
          <GlassSurface variant="subtle">
            <div className="p-5 sm:p-6">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground/90">We couldn’t load your subscriptions</div>
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
            </div>
          </GlassSurface>
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

        {loadError && subscriptions.length === 0 ? null : (
          <GlassSurface>
            <div className="p-6 sm:p-8 text-center">
              <div className="space-y-4">
                <p className="text-sm font-medium tracking-tight text-muted-foreground">You spend</p>
                <div className="text-5xl sm:text-6xl font-semibold tracking-tight tabular-nums text-foreground/95">
                  ${totalMonthly.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">
                  ${totalYearly.toFixed(0)} / year
                </p>
              </div>
            </div>
          </GlassSurface>
        )}

        {subscriptions.length === 0 && !loadError ? (
          <>
            <GlassSurface>
              <div className="p-6 sm:p-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <Sparkles className="h-5 w-5 text-foreground/80" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-lg sm:text-xl font-semibold tracking-tight text-foreground/95">
                  Get started with Subscription Map
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Track and manage all your recurring subscriptions in one place.
                </p>

                <div className="mt-5">
                  <Button type="button" variant="primary" className="w-full h-11" onClick={() => setFormOpen(true)}>
                    Add your first subscription
                  </Button>
                </div>

                <div className="mt-5 grid gap-2 text-left text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-white/20">•</span>
                    <span>Track recurring spending</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-white/20">•</span>
                    <span>See total monthly and yearly costs</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-white/20">•</span>
                    <span>Open cancel links directly</span>
                  </div>
                </div>
              </div>
            </GlassSurface>
            <AddSubscriptionForm
              onSuccess={handleCreatedSubscription}
              defaultOpen={formOpen}
            />
          </>
        ) : loadError && subscriptions.length === 0 ? null : (
          <>
            <AddSubscriptionForm
              onSuccess={(created) => {
                if (created) {
                  setSubscriptions((prev) => [created, ...prev])
                  setRecentlyAddedId(created.id)
                  scrollToSubscription(created.id)
                }
                loadSubscriptions({ silent: true })
              }}
            />

            {(() => {
              // Subtle, optional utility panel (kept low-noise, no extra colors).
              if (loadError) return null
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
                <GlassSurface variant="subtle">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <div className="text-sm font-semibold text-foreground/90">Upcoming renewals</div>
                        <div className="text-xs text-muted-foreground">Next 3 renewals based on your dates.</div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {upcoming.map(({ sub, daysUntil }) => (
                        <div key={sub.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate text-foreground/90">{sub.service}</div>
                            <div className="text-xs text-muted-foreground">
                              {(formatDisplayDate(sub.renewal_date) ?? sub.renewal_date) as string} •{" "}
                              {formatRenewalCountdown(daysUntil as number)}
                            </div>
                          </div>
                          <Button asChild size="sm" variant="outline" className="shrink-0">
                            <Link href={`/app/subscription/${sub.id}`}>Manage</Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </GlassSurface>
              )
            })()}
            
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
                  highlighted={sub.id === recentlyAddedId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
