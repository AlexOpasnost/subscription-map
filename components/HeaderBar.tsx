"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Map, LogOut } from "lucide-react"

interface HeaderBarProps {
  title: string
  onSignOut: () => void
  showMap?: boolean
}

export default function HeaderBar({ title, onSignOut, showMap = true }: HeaderBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex-1 min-w-0 truncate">
        {title}
      </h1>
      <div className="flex items-center gap-2 shrink-0">
        {showMap && (
          <Button variant="ghost" size="icon" asChild>
            <Link href="/app/map" aria-label="View map">
              <Map className="h-5 w-5" />
            </Link>
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Sign out">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
