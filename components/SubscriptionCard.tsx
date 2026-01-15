"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface SubscriptionCardProps {
  id: string
  service: string
  plan: string | null
  price_cents: number
  period: "monthly" | "yearly"
  category: string
  cancelled: boolean
}

export default function SubscriptionCard({
  id,
  service,
  plan,
  price_cents,
  period,
  category,
  cancelled,
}: SubscriptionCardProps) {
  const router = useRouter()
  const price = price_cents / 100
  const monthlyPrice = period === "monthly" ? price : price / 12
  const yearlyPrice = period === "yearly" ? price : price * 12

  // Sanitize category for display
  const displayCategory = category?.trim() || "—"
  const sanitizedCategory = displayCategory.length > 20 
    ? displayCategory.substring(0, 20) + "..." 
    : displayCategory

  return (
    <Card className="rounded-2xl shadow-sm border bg-card">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Row 1: Service name + plan badge, price right aligned */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`text-base font-semibold leading-tight break-words ${
                  cancelled ? "line-through text-muted-foreground" : ""
                }`}>
                  {service}
                </h3>
                {plan && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    {plan}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-bold tracking-tight tabular-nums">
                ${monthlyPrice.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">/mo</div>
            </div>
          </div>

          {/* Row 2: Metadata and status */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <span>{sanitizedCategory}</span>
              <span>•</span>
              <span>${yearlyPrice.toFixed(0)}/yr</span>
            </div>
            <Badge
              variant={cancelled ? "secondary" : "default"}
              className="text-xs shrink-0"
            >
              {cancelled ? "Paused" : "Active"}
            </Badge>
          </div>

          {/* Manage button */}
          <Button
            variant="outline"
            onClick={() => router.push(`/app/subscription/${id}`)}
            className="w-full sm:w-auto mt-2"
            size="sm"
          >
            Manage
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
