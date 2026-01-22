"use client"

import Link from "next/link"
import { Bot, List, LogOut, Map } from "lucide-react"

import { Button } from "@/components/ui/button"
import BrandLink from "@/components/BrandLink"

type AppHeaderProps = {
  title: string
  onSignOut: () => void
  currentPage?: "subscriptions" | "map" | "detail" | "assistant"
}

export default function AppHeader({ title, onSignOut, currentPage = "subscriptions" }: AppHeaderProps) {
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
          {currentPage !== "assistant" ? (
            <Button asChild variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label="Assistant">
              <Link href="/assistant">
                <Bot className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}

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

