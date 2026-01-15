"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import PageShell from "@/components/PageShell"

type Period = "monthly" | "yearly"

interface Subscription {
  id: string
  service: string
  price_cents: number
  period: Period
  category: string
}

interface Position {
  subscription: Subscription
  x: number
  y: number
  circleRadius: number
  textX: number
  textY: number
  monthlyCost: number
}

// Deterministic color mapping from category to Tailwind color classes
const categoryColors = [
  "fill-blue-500",
  "fill-green-500",
  "fill-purple-500",
  "fill-orange-500",
  "fill-pink-500",
  "fill-cyan-500",
  "fill-yellow-500",
  "fill-red-500",
  "fill-indigo-500",
  "fill-teal-500",
  "fill-amber-500",
  "fill-emerald-500",
]

function getCategoryColor(category: string): string {
  // Simple hash function for deterministic color assignment
  let hash = 0
  for (let i = 0; i < category.length; i++) {
    hash = ((hash << 5) - hash + category.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % categoryColors.length
  return categoryColors[index]
}

function getMonthlyCost(subscription: Subscription): number {
  const price = subscription.price_cents / 100
  return subscription.period === "monthly" ? price : price / 12
}

export default function MapPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)

  // Load subscriptions from Supabase
  useEffect(() => {
    if (!user) return

    const loadSubscriptions = async () => {
      try {
        const { data, error } = await supabase
          .from("subscriptions")
          .select("id,service,price_cents,period,category")
          .eq("cancelled", false) // Only show active subscriptions on map
          .order("created_at", { ascending: false })

        if (error) throw error
        setSubscriptions(data || [])
      } catch (error) {
        console.error("Failed to load subscriptions:", error)
      } finally {
        setLoading(false)
      }
    }

    loadSubscriptions()
  }, [user])

  // Calculate totals
  const totalMonthly = subscriptions.reduce((sum, sub) => {
    return sum + getMonthlyCost(sub)
  }, 0)

  const totalYearly = subscriptions.reduce((sum, sub) => {
    const price = sub.price_cents / 100
    return sub.period === "yearly" ? sum + price : sum + price * 12
  }, 0)

  // Get top 3 subscriptions by monthly cost
  const topSubscriptions = [...subscriptions]
    .sort((a, b) => getMonthlyCost(b) - getMonthlyCost(a))
    .slice(0, 3)

  // Calculate positions for subscription circles
  const centerX = 400
  const centerY = 400
  const radius = 250
  const svgSize = 800

  // Calculate circle sizes (normalized between min and max)
  const monthlyCosts = subscriptions.map(getMonthlyCost)
  const minCost = Math.min(...monthlyCosts, 1)
  const maxCost = Math.max(...monthlyCosts, 1)
  const minRadius = 15
  const maxRadius = 50

  function getCircleRadius(monthlyCost: number): number {
    if (maxCost === minCost) return (minRadius + maxRadius) / 2
    const normalized = (monthlyCost - minCost) / (maxCost - minCost)
    return minRadius + normalized * (maxRadius - minRadius)
  }

  // Calculate positions evenly distributed around the circle
  const positions: Position[] = subscriptions.map((sub, index): Position => {
    const angle = (index * (2 * Math.PI)) / subscriptions.length - Math.PI / 2 // Start from top
    const monthlyCost = getMonthlyCost(sub)
    const x = centerX + radius * Math.cos(angle)
    const y = centerY + radius * Math.sin(angle)
    const circleRadius = getCircleRadius(monthlyCost)
    
    // Text position - offset to avoid overlap with circle
    const textX = x + (x > centerX ? circleRadius + 10 : -(circleRadius + 10))
    const textY = y

    return {
      subscription: sub,
      x,
      y,
      circleRadius,
      textX,
      textY,
      monthlyCost,
    }
  })

  if (loading) {
    return (
      <PageShell title="Subscription Map" maxWidth="4xl">
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  if (subscriptions.length === 0) {
    return (
      <PageShell
        title="Subscription Map"
        maxWidth="4xl"
      >
        <Button
          variant="ghost"
          onClick={() => router.push("/app")}
          className="w-full sm:w-auto -ml-2 sm:ml-0 mb-6"
        >
          ← Back
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 sm:py-20">
            <div className="text-center space-y-4 max-w-md">
              <h3 className="text-lg sm:text-xl font-semibold">
                You're all set — now add your first subscription
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                Add a subscription to start visualizing where your money goes every month.
              </p>
              <Button asChild className="mt-4">
                <Link href="/app/subscription/new">Add subscription</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Subscription Map"
      maxWidth="4xl"
    >
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/app")}
          className="w-full sm:w-auto -ml-2 sm:ml-0"
        >
          ← Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Your Subscription Map</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl sm:text-5xl font-bold tracking-tight tabular-nums mb-1">
                  ${totalMonthly.toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">per month</div>
              </div>
              <div className="text-center pt-2 border-t">
                <div className="text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums mb-1">
                  ${totalYearly.toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">per year</div>
              </div>
              <div className="text-center pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Based on {subscriptions.length} active {subscriptions.length === 1 ? "subscription" : "subscriptions"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {topSubscriptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top subscriptions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topSubscriptions.map((sub) => {
                  const monthlyCost = getMonthlyCost(sub)
                  return (
                    <div key={sub.id} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{sub.service}</span>
                      <span className="text-sm font-semibold tabular-nums">
                        ${monthlyCost.toFixed(2)}/mo
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="w-full overflow-x-auto -mx-3 sm:mx-0">
              <div className="rounded-lg border bg-card p-3 sm:p-4 min-w-0 inline-block">
                <svg
                  viewBox={`0 0 ${svgSize} ${svgSize}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-auto min-w-[300px]"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Background */}
                  <rect
                    width={svgSize}
                    height={svgSize}
                    fill="transparent"
                  />

                  {/* Center circle - "You" */}
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={30}
                    className="fill-gray-900 dark:fill-gray-100"
                  />
                  <text
                    x={centerX}
                    y={centerY + 5}
                    textAnchor={"middle" as const}
                    className="fill-white dark:fill-gray-900 font-semibold"
                    fontSize="14"
                  >
                    You
                  </text>

                  {/* Subscription circles and labels */}
                  {positions.map((pos) => {
                    const color = getCategoryColor(pos.subscription.category)
                    return (
                      <g key={pos.subscription.id}>
                        {/* Subscription circle */}
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={pos.circleRadius}
                          className={color}
                          opacity="0.8"
                        />
                        
                        {/* Subscription name and cost */}
                        <text
                          x={pos.textX}
                          y={pos.textY - 5}
                          textAnchor={"middle" as const}
                          className="fill-foreground font-semibold"
                          fontSize="12"
                        >
                          {pos.subscription.service}
                        </text>
                        <text
                          x={pos.textX}
                          y={pos.textY + 10}
                          textAnchor={"middle" as const}
                          className="fill-muted-foreground"
                          fontSize="11"
                        >
                          ${pos.monthlyCost.toFixed(2)}/mo
                        </text>
                      </g>
                    )
                  })}

                  {/* Optional: Lines connecting center to subscriptions (light guide lines) */}
                  {positions.map((pos) => (
                    <line
                      key={`line-${pos.subscription.id}`}
                      x1={centerX}
                      y1={centerY}
                      x2={pos.x}
                      y2={pos.y}
                      stroke="currentColor"
                      className="stroke-gray-300 dark:stroke-gray-700"
                      strokeWidth="1"
                      opacity="0.3"
                    />
                  ))}
                </svg>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-4">
              This view shows where your money goes
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
