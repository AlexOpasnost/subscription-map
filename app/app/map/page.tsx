"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import PageShell from "@/components/PageShell"
import HeaderBar from "@/components/HeaderBar"
import EmptyState from "@/components/EmptyState"
import { useToast } from "@/components/ToastProvider"
import { humanizeError, withTimeout } from "@/lib/humanizeError"

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

function truncateLabel(s: string, maxLen: number): string {
  const trimmed = s.trim()
  if (trimmed.length <= maxLen) return trimmed
  return `${trimmed.slice(0, Math.max(0, maxLen - 1))}…`
}

export default function MapPage() {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false
  )
  const [showMap, setShowMap] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false
  )
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(max-width: 640px)")
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  // Load subscriptions from Supabase
  useEffect(() => {
    if (!user) return

    const loadSubscriptions = async () => {
      try {
        setLoadError("")
        const { data, error } = await withTimeout(
          supabase
            .from("subscriptions")
            .select("id,service,price_cents,period,category")
            .eq("cancelled", false) // Only show active subscriptions on map
            .order("created_at", { ascending: false })
        )

        if (error) throw error
        setSubscriptions(data || [])
      } catch (error) {
        console.error("Failed to load subscriptions:", error)
        const msg = humanizeError(error)
        setLoadError(msg)
        toast({ title: "Couldn’t load map data", description: msg, variant: "error" })
      } finally {
        setLoading(false)
      }
    }

    loadSubscriptions()
  }, [user, toast])

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

  const mapSubscriptions = useMemo(() => {
    const maxItems = isMobile ? 6 : 8
    return [...subscriptions]
      .sort((a, b) => getMonthlyCost(b) - getMonthlyCost(a))
      .slice(0, maxItems)
  }, [subscriptions, isMobile])

  const labeledIds = useMemo(() => {
    const labelCount = isMobile ? 3 : 5
    return new Set(mapSubscriptions.slice(0, labelCount).map((s) => s.id))
  }, [mapSubscriptions, isMobile])

  // SVG layout constants (only used when map is shown)
  const centerX = 400
  const centerY = 400
  const radius = 250
  const svgSize = 800

  const positions: Position[] = useMemo(() => {
    if (!showMap || mapSubscriptions.length === 0) return []

    // Calculate circle sizes (normalized between min and max)
    const monthlyCosts = mapSubscriptions.map(getMonthlyCost)
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
    return mapSubscriptions.map((sub, index): Position => {
      const angle = (index * (2 * Math.PI)) / mapSubscriptions.length - Math.PI / 2 // Start from top
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
  }, [showMap, mapSubscriptions])

  if (loading) {
    return (
      <PageShell>
        <HeaderBar title="Subscription Map" onSignOut={signOut} currentPage="map" />
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  if (subscriptions.length === 0) {
    return (
      <PageShell>
        <HeaderBar title="Subscription Map" onSignOut={signOut} currentPage="map" />
        <EmptyState
          title="No subscriptions to visualize"
          description="Add subscriptions to see them on the map."
          ctaLabel="Go to Subscriptions"
          onCtaClick={() => router.push("/app")}
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <HeaderBar title="Subscription Map" onSignOut={signOut} currentPage="map" />
      
      <div className="space-y-6">
          {loadError && (
            <Card className="rounded-2xl shadow-sm border bg-card">
              <CardContent className="p-4 text-sm text-destructive">
                {loadError}
              </CardContent>
            </Card>
          )}
        <Card className="rounded-2xl shadow-sm border bg-card">
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
          <Card className="rounded-2xl shadow-sm border bg-card">
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

        <Card className="rounded-2xl shadow-sm border bg-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 px-1 py-1">
              <div className="text-sm font-medium">Map</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowMap((v) => !v)}
              >
                {showMap ? "Hide map" : "Show map"}
              </Button>
            </div>

            {showMap ? (
              <>
                <div className="mt-3 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">This view highlights your biggest recurring costs.</span>{" "}
                  Tap a circle to open details. Circle size = monthly cost, color = category.
                </div>

                <div className="w-full overflow-hidden mt-3">
                  <div className="rounded-lg border bg-card p-3 sm:p-4">
                    <svg
                      viewBox={`0 0 ${svgSize} ${svgSize}`}
                      preserveAspectRatio="xMidYMid meet"
                      className="w-full h-auto"
                      xmlns="http://www.w3.org/2000/svg"
                    >
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

                      {/* Subscription circles and labels */}
                      {positions.map((pos) => {
                        const color = getCategoryColor(pos.subscription.category)
                        const isLabeled = labeledIds.has(pos.subscription.id)
                        const labelMax = isMobile ? 10 : 14
                        const serviceLabel = truncateLabel(pos.subscription.service, labelMax)
                        return (
                          <g
                            key={pos.subscription.id}
                            className="cursor-pointer"
                            role="link"
                            tabIndex={0}
                            onClick={() => router.push(`/app/subscription/${pos.subscription.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                router.push(`/app/subscription/${pos.subscription.id}`)
                              }
                            }}
                          >
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={pos.circleRadius}
                              className={color}
                              opacity="0.8"
                            >
                              <title>
                                {pos.subscription.service} • ${pos.monthlyCost.toFixed(2)}/mo •{" "}
                                {pos.subscription.category || "Uncategorized"}
                              </title>
                            </circle>

                            {isLabeled ? (
                              <>
                                <text
                                  x={pos.textX}
                                  y={pos.textY - 5}
                                  textAnchor={"middle" as const}
                                  className="fill-foreground font-semibold"
                                  fontSize={isMobile ? "11" : "12"}
                                >
                                  {serviceLabel}
                                </text>
                                <text
                                  x={pos.textX}
                                  y={pos.textY + 10}
                                  textAnchor={"middle" as const}
                                  className="fill-muted-foreground"
                                  fontSize={isMobile ? "10" : "11"}
                                >
                                  ${pos.monthlyCost.toFixed(2)}/mo
                                </text>
                              </>
                            ) : null}
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center mt-4">
                The map is optional. Show it when you want a quick view of your biggest recurring costs.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
