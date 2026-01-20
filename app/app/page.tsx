"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
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
        <AppHeader title="Subscriptions" onSignOut={signOut} currentPage="subscriptions" />
        <div className="mx-auto w-full max-w-[720px] space-y-5">
          <Card className="border border-white/8 bg-white/[0.04] shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <CardContent className="p-6 sm:p-8 text-center">
              <div className="space-y-4">
                <Skeleton className="h-4 w-20 mx-auto opacity-60" />
                <Skeleton className="h-14 w-44 mx-auto opacity-70" />
                <Skeleton className="h-5 w-28 mx-auto opacity-60" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/8 bg-white/[0.03] shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <CardContent className="p-4 sm:p-5">
              <Skeleton className="h-10 w-full opacity-60" />
            </CardContent>
          </Card>

          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="border border-white/8 bg-white/[0.03] shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <CardContent className="p-4 sm:p-5">
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
      <AppHeader title="Subscriptions" onSignOut={signOut} currentPage="subscriptions" />
      
      <div className="relative mx-auto w-full max-w-[720px] space-y-5">
        <div
          className="pointer-events-none absolute -inset-x-6 -top-10 -bottom-10"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(900px 520px at 50% 0%, rgba(59,130,246,0.10), transparent 62%)," +
              "radial-gradient(900px 600px at 50% 110%, rgba(255,255,255,0.04), transparent 60%)",
          }}
        />

        {loadError && subscriptions.length > 0 ? (
          <Card className="border border-white/8 bg-white/[0.04] shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <CardContent className="p-5 sm:p-6">
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

        {loadError && subscriptions.length === 0 ? null : (
          <Card className="border border-white/8 bg-white/[0.04] shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <CardContent className="p-6 sm:p-8 text-center">
              <div className="space-y-4">
                <p className="text-sm font-medium tracking-tight text-muted-foreground">You spend</p>
                <div className="text-5xl sm:text-6xl font-semibold tracking-tight tabular-nums text-foreground/95">
                  ${totalMonthly.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">
                  ${totalYearly.toFixed(0)} / year
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {subscriptions.length === 0 && !loadError ? (
          <>
            <Card className="border border-white/8 bg-white/[0.04] shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
              <CardContent className="p-6 sm:p-8 text-center">
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
              </CardContent>
            </Card>
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
                <Card className="border border-white/8 bg-white/[0.03] shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                  <CardContent className="p-5 sm:p-6">
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
                  </CardContent>
                </Card>
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
                />
              ))}
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
