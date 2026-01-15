"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Map, LogOut, List } from "lucide-react"

interface HeaderBarProps {
  title: string
  onSignOut: () => void
  currentPage?: "subscriptions" | "map" | "detail"
}

export default function HeaderBar({ title, onSignOut, currentPage = "subscriptions" }: HeaderBarProps) {
  return (
    <div className="flex items-center justify-between gap-2 mb-6">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="h-6 w-6 rounded bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground text-xs font-bold">SM</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {currentPage !== "map" && (
          <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
            <Link href="/app/map" aria-label="View map">
              <Map className="h-4 w-4" />
            </Link>
          </Button>
        )}
        {currentPage !== "subscriptions" && (
          <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
            <Link href="/app" aria-label="Subscriptions">
              <List className="h-4 w-4" />
            </Link>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onSignOut} className="h-8 w-8 p-0" aria-label="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
