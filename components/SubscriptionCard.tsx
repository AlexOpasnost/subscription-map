"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useRouter } from "next/navigation"

interface SubscriptionCardProps {
  id: string
  service: string
  plan: string | null
  price_cents: number
  period: "monthly" | "yearly"
  cancelled: boolean
  onTogglePaused: () => void
  onDelete: () => void
}

export default function SubscriptionCard({
  id,
  service,
  plan,
  price_cents,
  period,
  cancelled,
  onTogglePaused,
  onDelete,
}: SubscriptionCardProps) {
  const router = useRouter()
  const price = price_cents / 100
  const monthlyPrice = period === "monthly" ? price : price / 12
  const yearlyPrice = period === "yearly" ? price : price * 12

  return (
    <Card className="rounded-2xl shadow-sm border">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className={`text-base font-semibold leading-tight break-words ${
                cancelled ? "line-through text-muted-foreground" : ""
              }`}>
                {service}
              </h3>
              {plan && (
                <p className="text-xs text-muted-foreground mt-0.5 break-words">
                  {plan}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-bold tracking-tight tabular-nums">
                ${monthlyPrice.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">/mo</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                ${yearlyPrice.toFixed(0)}/yr
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t">
            <div className="flex items-center gap-2 flex-1">
              <Checkbox
                checked={cancelled || false}
                onChange={onTogglePaused}
                label=""
              />
              <label className="text-xs text-muted-foreground cursor-pointer" onClick={onTogglePaused}>
                Paused
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/app/subscription/${id}`)}
                className="text-xs"
              >
                Manage
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onDelete}
                className="text-xs"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
