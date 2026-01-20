"use client"

import Link from "next/link"
import { List, LogOut, Map } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type AppHeaderProps = {
  title: string
  onSignOut: () => void
  currentPage?: "subscriptions" | "map" | "detail"
}

export default function AppHeader({ title, onSignOut, currentPage = "subscriptions" }: AppHeaderProps) {
  return (
    <div className="sticky top-4 z-40 mb-8">
      <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card/70 backdrop-blur px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "h-9 w-9 shrink-0 rounded-xl border border-border/70 bg-muted/40",
              "flex items-center justify-center"
            )}
            aria-hidden="true"
          >
            <span className="text-xs font-semibold tracking-tight text-foreground/90">SM</span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base sm:text-lg font-medium tracking-tight">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {currentPage !== "map" ? (
            <Button asChild variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label="View map">
              <Link href="/app/map">
                <Map className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}

          {currentPage !== "subscriptions" ? (
            <Button asChild variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label="Subscriptions">
              <Link href="/app">
                <List className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            className="h-9 w-9 p-0"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

