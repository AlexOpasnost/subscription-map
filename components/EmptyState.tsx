"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface EmptyStateProps {
  title: string
  description?: string
  bullets?: string[]
  ctaLabel: string
  onCtaClick: () => void
}

export default function EmptyState({
  title,
  description,
  bullets,
  ctaLabel,
  onCtaClick,
}: EmptyStateProps) {
  return (
    <Card className="rounded-2xl shadow-sm border bg-card">
      <CardContent className="py-12 px-6 text-center">
        <div className="space-y-4 max-w-md mx-auto">
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          {bullets && bullets.length > 0 && (
            <ul className="text-left space-y-2 text-sm text-muted-foreground">
              {bullets.map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-muted-foreground/70 mt-0.5">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          <Button onClick={onCtaClick} className="mt-6 w-full sm:w-auto">
            {ctaLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
