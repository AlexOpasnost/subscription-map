"use client"

import Link from "next/link"
import { Bell, CalendarDays, List, LogOut, Map, Settings } from "lucide-react"
import { useEffect, useState } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import BrandLink from "@/components/BrandLink"

type AppHeaderProps = {
  title: string
  onSignOut: () => void
  currentPage?: "subscriptions" | "map" | "timeline" | "detail" | "settings" | "notifications"
}

export default function AppHeader({ title, onSignOut, currentPage = "subscriptions" }: AppHeaderProps) {
  const [notifCount, setNotifCount] = useState<number>(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch("/api/notifications/count", { method: "GET", credentials: "include" })
        if (!res.ok) return
        const json = (await res.json()) as unknown
        const count = typeof (json as any)?.count === "number" ? Number((json as any).count) : 0
        if (!cancelled) setNotifCount(Number.isFinite(count) ? count : 0)
      } catch {
        // ignore
      }
    }
    run()
    const t = window.setInterval(run, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [])

  return (
    <div className="sticky top-4 z-40 mb-8">
      <div className="flex items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-[rgba(19,20,23,0.62)] backdrop-blur-xl px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
        <div className="flex flex-1 items-center gap-3 min-w-0 overflow-hidden">
          <BrandLink className="shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-base sm:text-lg font-medium tracking-tight">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {currentPage !== "notifications" ? (
            <Link
              href="/app/notifications"
              aria-label="Notifications"
              className={buttonVariants({ variant: "ghost", size: "sm", className: "h-9 w-9 p-0 relative" })}
            >
              <Bell className="h-4 w-4" />
              {notifCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] leading-[18px] text-center">
                  {notifCount > 99 ? "99+" : String(notifCount)}
                </span>
              ) : null}
            </Link>
          ) : null}

          {currentPage !== "settings" ? (
            <Link
              href="/settings/notifications"
              aria-label="Settings"
              className={buttonVariants({ variant: "ghost", size: "sm", className: "h-9 w-9 p-0" })}
            >
              <Settings className="h-4 w-4" />
            </Link>
          ) : null}

          {currentPage !== "timeline" ? (
            <Link
              href="/app/timeline"
              aria-label="Timeline"
              className={buttonVariants({ variant: "ghost", size: "sm", className: "h-9 w-9 p-0" })}
            >
              <CalendarDays className="h-4 w-4" />
            </Link>
          ) : null}

          {currentPage !== "map" ? (
            <Link
              href="/app/map"
              aria-label="View map"
              className={buttonVariants({ variant: "ghost", size: "sm", className: "h-9 w-9 p-0" })}
            >
              <Map className="h-4 w-4" />
            </Link>
          ) : null}

          {currentPage !== "subscriptions" ? (
            <Link
              href="/app"
              aria-label="Subscriptions"
              className={buttonVariants({ variant: "ghost", size: "sm", className: "h-9 w-9 p-0" })}
            >
              <List className="h-4 w-4" />
            </Link>
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

