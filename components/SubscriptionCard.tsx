"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { daysUntilYyyyMmDd, formatRenewalCountdown } from "@/lib/renewals"
import { getCheaperRegions } from "@/lib/priceComparison"
import { formatDisplayDate } from "@/lib/formatDisplayDate"

interface SubscriptionCardProps {
  id: string
  service: string
  plan: string | null
  price_cents: number
  period: "monthly" | "yearly"
  category: string
  cancelled: boolean
  renewal_date?: string | null
  reminder_days?: number | null
}

export default function SubscriptionCard({
  id,
  service,
  plan,
  price_cents,
  period,
  category,
  cancelled,
  renewal_date,
  reminder_days,
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

  const daysUntilRenewal =
    !cancelled && renewal_date ? daysUntilYyyyMmDd(renewal_date) : null
  const reminderWindow = reminder_days ?? 3
  const showRenewalBadge =
    daysUntilRenewal !== null && daysUntilRenewal >= 0 && daysUntilRenewal <= reminderWindow

  const cheaperRegions = getCheaperRegions(service)

  return (
    <Card
      className={cn(
        "rounded-2xl shadow-sm border bg-card transition-shadow",
        cancelled ? "opacity-70" : "hover:shadow-md"
      )}
    >
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
                <Badge
                  variant={cancelled ? "secondary" : "default"}
                  className="text-xs shrink-0"
                >
                  {cancelled ? "Cancelled" : "Active"}
                </Badge>
                {showRenewalBadge && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {formatRenewalCountdown(daysUntilRenewal)}
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
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground min-w-0">
              <span>{sanitizedCategory}</span>
              <span>•</span>
              <span>${yearlyPrice.toFixed(0)}/yr</span>
              {!cancelled && renewal_date ? (
                <>
                  <span>•</span>
                  <span className="truncate">
                    Next renewal: {formatDisplayDate(renewal_date) ?? renewal_date}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Info only:</span> This service is often cheaper in{" "}
              <span className="text-foreground">{cheaperRegions.join(", ")}</span>. Pricing varies by region and can change.
            </div>
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
