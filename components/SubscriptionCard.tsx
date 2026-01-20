"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { daysUntilYyyyMmDd, formatRenewalCountdown } from "@/lib/renewals"
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

  return (
    <Card
      className={cn(
        "border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl",
        "transition-[transform,box-shadow] duration-200",
        cancelled ? "opacity-70" : "hover:-translate-y-px hover:shadow-[0_26px_90px_rgba(0,0,0,0.55)]"
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="space-y-4">
          {/* Row 1: Service name + plan badge, price right aligned */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`text-base font-semibold leading-tight break-words text-foreground/95 ${
                  cancelled ? "line-through text-muted-foreground" : ""
                }`}>
                  {service}
                </h3>
                {plan && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {plan}
                  </Badge>
                )}
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs shrink-0",
                    cancelled ? "bg-white/3 border-white/8 text-muted-foreground" : "bg-white/5 border-white/10 text-foreground/80"
                  )}
                >
                  {cancelled ? "Cancelled" : "Active"}
                </Badge>
                {showRenewalBadge && (
                  <Badge
                    variant="secondary"
                    className="text-xs shrink-0 border-[color:color-mix(in_srgb,var(--accent-2)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--accent-2)_10%,transparent)] text-foreground/80"
                  >
                    {formatRenewalCountdown(daysUntilRenewal)}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-semibold tracking-tight tabular-nums text-foreground/95">
                ${monthlyPrice.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">/mo</div>
            </div>
          </div>

          {/* Row 2: Metadata and status */}
          <div className="pt-3 border-t border-white/8">
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground min-w-0">
              <span>{sanitizedCategory}</span>
              <span className="text-white/12">•</span>
              <span>${yearlyPrice.toFixed(0)}/yr</span>
              {!cancelled && renewal_date ? (
                <>
                  <span className="text-white/12">•</span>
                  <span className="truncate">
                    Next renewal: {formatDisplayDate(renewal_date) ?? renewal_date}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {/* Manage button */}
          <div className="pt-1">
            <Button
              variant="outline"
              onClick={() => router.push(`/app/subscription/${id}`)}
              className="w-full sm:w-auto"
              size="sm"
            >
              Manage
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
