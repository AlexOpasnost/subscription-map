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
  const [formOpen, setFormOpen] = useState(false)

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
      <PageShell>
        <HeaderBar title="Subscriptions" onSignOut={signOut} currentPage="subscriptions" />
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <HeaderBar title="Subscriptions" onSignOut={signOut} currentPage="subscriptions" />
      
      <div className="space-y-6">
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

        {subscriptions.length === 0 ? (
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
              onSuccess={() => {
                loadSubscriptions()
                setFormOpen(false)
              }}
              defaultOpen={formOpen}
            />
          </>
        ) : (
          <>
            <AddSubscriptionForm onSuccess={loadSubscriptions} />
            
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
                />
              ))}
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
