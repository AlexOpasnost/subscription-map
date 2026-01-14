"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import Link from "next/link"
import PageShell from "@/components/PageShell"

interface Subscription {
  id: string
  service: string
  plan: string | null
  price_cents: number
  period: "monthly" | "yearly"
  category: string
  cancelled: boolean
  created_at: string
}

export default function AppPage() {
  const { user, signOut } = useAuth()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)

  const loadSubscriptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id,service,plan,price_cents,period,category,cancelled,created_at")
        .order("created_at", { ascending: false })

      if (error) {
        console.error(error)
        return
      }
      setSubscriptions(data || [])
    } catch (error: any) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

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
      <PageShell title="Subscriptions" maxWidth="4xl">
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Subscriptions"
      maxWidth="4xl"
    >
      <div className="space-y-6">
        <Card>
          <CardContent className="p-8 text-center">
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

        <Button asChild className="w-full" size="lg">
          <Link href="/app/subscription/new">+ Add subscription</Link>
        </Button>

        {subscriptions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No subscriptions yet. Add your first one to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {subscriptions.map((sub) => {
              const price = sub.price_cents / 100
              const monthlyPrice = sub.period === "monthly" ? price : price / 12
              return (
                <Link key={sub.id} href={`/app/subscription/${sub.id}`}>
                  <Card className="transition-all hover:shadow-md cursor-pointer rounded-lg">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold leading-tight break-words flex-1 min-w-0">
                          {sub.service}
                        </h3>
                        <div className="ml-4 shrink-0 text-right">
                          <div className="text-lg font-bold tracking-tight tabular-nums">
                            ${monthlyPrice.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">/mo</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </PageShell>
  )
}
