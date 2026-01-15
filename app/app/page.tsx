"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import PageShell from "@/components/PageShell"
import HeaderBar from "@/components/HeaderBar"
import SubscriptionCard from "@/components/SubscriptionCard"
import AddSubscriptionDialog from "@/components/AddSubscriptionDialog"

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
  const [dialogOpen, setDialogOpen] = useState(false)

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

  const handleTogglePaused = async (id: string) => {
    const subscription = subscriptions.find((sub) => sub.id === id)
    if (!subscription) return

    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ cancelled: !subscription.cancelled })
        .eq("id", id)

      if (error) {
        console.error(error)
        return
      }

      setSubscriptions(
        subscriptions.map((sub) =>
          sub.id === id ? { ...sub, cancelled: !sub.cancelled } : sub
        )
      )
    } catch (error: any) {
      console.error(error)
    }
  }

  const handleDelete = async (id: string) => {
    const subscription = subscriptions.find((sub) => sub.id === id)
    if (!subscription) return

    if (!confirm(`Delete ${subscription.service}? This cannot be undone.`)) {
      return
    }

    try {
      const { error } = await supabase
        .from("subscriptions")
        .delete()
        .eq("id", id)

      if (error) {
        console.error(error)
        return
      }

      setSubscriptions(subscriptions.filter((sub) => sub.id !== id))
    } catch (error: any) {
      console.error(error)
    }
  }

  if (loading) {
    return (
      <PageShell>
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <HeaderBar title="Subscriptions" onSignOut={signOut} />
      
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

        <Button
          onClick={() => setDialogOpen(true)}
          className="w-full rounded-2xl"
          size="lg"
        >
          + Add subscription
        </Button>

        {subscriptions.length === 0 ? (
          <Card className="rounded-2xl shadow-sm border bg-card">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No subscriptions yet. Add your first one to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                id={sub.id}
                service={sub.service}
                plan={sub.plan}
                price_cents={sub.price_cents}
                period={sub.period}
                cancelled={sub.cancelled}
                onTogglePaused={() => handleTogglePaused(sub.id)}
                onDelete={() => handleDelete(sub.id)}
              />
            ))}
          </div>
        )}
      </div>

      <AddSubscriptionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={loadSubscriptions}
      />
    </PageShell>
  )
}
