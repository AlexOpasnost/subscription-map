"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import { subscriptionCatalog } from "@/lib/subscriptionCatalog"
import PageShell from "@/components/PageShell"
import HeaderBar from "@/components/HeaderBar"
import { Checkbox } from "@/components/ui/checkbox"

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

export default function SubscriptionDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const { user, signOut } = useAuth()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

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
          router.push("/app")
          return
        }

        setSubscription(data)
      } catch (error: any) {
        console.error(error)
        router.push("/app")
      } finally {
        setLoading(false)
      }
    }

    loadSubscription()
  }, [user, params.id, router])

  const handleTogglePaused = async () => {
    if (!subscription) return

    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ cancelled: !subscription.cancelled })
        .eq("id", subscription.id)

      if (error) {
        console.error(error)
        return
      }

      setSubscription({ ...subscription, cancelled: !subscription.cancelled })
    } catch (error: any) {
      console.error(error)
    }
  }

  const handleOpenCancelPage = () => {
    if (!subscription) return

    const catalogService = subscriptionCatalog.find(
      (service) => service.serviceName === subscription.service
    )
    const cancelUrl = catalogService?.cancelUrl

    if (!cancelUrl) {
      return
    }

    window.open(cancelUrl, "_blank", "noopener,noreferrer")
  }

  const handleDelete = async () => {
    if (!subscription) return

    if (!confirm(`Delete ${subscription.service}? This cannot be undone.`)) {
      return
    }

    setDeleting(true)
    try {
      const { error } = await supabase
        .from("subscriptions")
        .delete()
        .eq("id", subscription.id)

      if (error) {
        console.error(error)
        setDeleting(false)
        return
      }

      router.push("/app")
    } catch (error: any) {
      console.error(error)
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <PageShell>
        <HeaderBar title="Subscription" onSignOut={signOut} showMap={false} />
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  if (!subscription) {
    return (
      <PageShell>
        <HeaderBar title="Subscription" onSignOut={signOut} showMap={false} />
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
  const hasCancelUrl = !!catalogService?.cancelUrl

  return (
    <PageShell>
      <HeaderBar title={subscription.service} onSignOut={signOut} showMap={false} />
      
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/app")}
          className="w-full sm:w-auto -ml-2 sm:ml-0"
        >
          ← Back
        </Button>

        <Card className="rounded-2xl shadow-sm border bg-card">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
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
                <span className="text-sm font-medium">
                  {subscription.category || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm font-medium text-muted-foreground">Status</span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                  subscription.cancelled
                    ? "bg-muted text-muted-foreground"
                    : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                }`}>
                  {subscription.cancelled ? "Paused" : "Active"}
                </span>
              </div>
            </div>
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
                disabled={!hasCancelUrl}
                className="w-full"
              >
                Open cancel page
              </Button>
              {!hasCancelUrl && (
                <p className="text-xs text-muted-foreground">
                  No cancel link available
                </p>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5 flex-1">
                <label className="text-sm font-medium cursor-pointer" onClick={handleTogglePaused}>
                  Pause subscription
                </label>
                <p className="text-xs text-muted-foreground">
                  Temporarily mark this subscription as inactive
                </p>
              </div>
              <Checkbox
                checked={subscription.cancelled || false}
                onChange={handleTogglePaused}
                label=""
              />
            </div>

            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="w-full"
            >
              {deleting ? "Deleting..." : "Delete subscription"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
