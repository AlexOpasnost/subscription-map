"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import { subscriptionCatalog } from "@/lib/subscriptionCatalog"
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

export default function SubscriptionDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
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

  const handleToggleCancelled = async () => {
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

  const handleCancelSubscription = async () => {
    if (!subscription) return

    const catalogService = subscriptionCatalog.find(
      (service) => service.serviceName === subscription.service
    )
    const cancelUrl = catalogService?.cancelUrl

    if (!cancelUrl) {
      alert(
        `Cancel URL not available for ${subscription.service}. Please visit the provider's website to cancel your subscription.`
      )
      return
    }

    window.open(cancelUrl, "_blank", "noopener,noreferrer")

    if (!subscription.cancelled) {
      try {
        const { error } = await supabase
          .from("subscriptions")
          .update({ cancelled: true })
          .eq("id", subscription.id)

        if (error) {
          console.error(error)
          return
        }

        setSubscription({ ...subscription, cancelled: true })
      } catch (error: any) {
        console.error(error)
      }
    }
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
      <PageShell title="Subscription" maxWidth="2xl">
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  if (!subscription) {
    return (
      <PageShell title="Subscription" maxWidth="2xl">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Subscription not found.</p>
            <Button onClick={() => router.push("/app")} className="mt-4">
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

  return (
    <PageShell
      title={subscription.service}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-muted-foreground">Monthly Cost</span>
              <span className="text-3xl font-bold tracking-tight tabular-nums">
                ${monthlyPrice.toFixed(2)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-muted-foreground">Yearly Cost</span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                ${yearlyPrice.toFixed(2)}
              </span>
            </div>
            {subscription.plan && (
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm font-medium text-muted-foreground">Plan</span>
                <span className="text-sm font-medium">{subscription.plan}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-medium text-muted-foreground">Category</span>
              <span className="text-sm font-medium">{subscription.category}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-medium text-muted-foreground">Billing Period</span>
              <span className="text-sm font-medium capitalize">{subscription.period}</span>
            </div>
            {subscription.cancelled && (
              <div className="pt-2 border-t">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                  Inactive
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Manage your subscription</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Paused</label>
                <p className="text-xs text-muted-foreground">
                  Mark this subscription as inactive
                </p>
              </div>
              <Checkbox
                checked={subscription.cancelled || false}
                onChange={handleToggleCancelled}
                label=""
              />
            </div>

            {!subscription.cancelled && (
              <Button
                variant="outline"
                onClick={handleCancelSubscription}
                className="w-full"
              >
                Manage Subscription
              </Button>
            )}

            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="w-full"
            >
              {deleting ? "Deleting..." : "Delete Subscription"}
            </Button>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          onClick={() => router.push("/app")}
          className="w-full"
        >
          Back to Subscriptions
        </Button>
      </div>
    </PageShell>
  )
}
