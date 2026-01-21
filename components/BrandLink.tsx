"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const TARGET_HREF = "/app"

function normalizePathname(pathname: string): string {
  // Keep comparisons stable between "/app" and "/app/".
  if (!pathname) return pathname
  if (pathname === "/") return pathname
  return pathname.replace(/\/+$/, "")
}

type BrandLinkProps = {
  className?: string
}

export default function BrandLink({ className }: BrandLinkProps) {
  const pathname = usePathname()
  const isCurrent = normalizePathname(pathname ?? "") === normalizePathname(TARGET_HREF)

  return (
    <Link
      href={TARGET_HREF}
      prefetch
      aria-label="Go to subscriptions"
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        // Layout (pill)
        "inline-flex items-center gap-2 rounded-full whitespace-nowrap px-2 py-1 sm:px-2.5 sm:py-1.5",
        // Visual style (Revolut-like dark)
        "text-foreground/85 hover:text-foreground/90",
        "hover:bg-white/5 hover:brightness-105",
        // Interaction + a11y
        "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "active:scale-[0.98]",
        "transition-[transform,background-color,filter,opacity,color] duration-150",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        // Current page hint (subtle)
        isCurrent ? "bg-white/6" : "",
        className
      )}
    >
      <Image
        src="/logo.png"
        alt=""
        width={32}
        height={32}
        priority
        className="size-8 shrink-0 rounded-lg"
        aria-hidden="true"
      />
      <span className="hidden sm:inline text-sm font-semibold tracking-tight text-foreground/80">Subscription Map</span>
    </Link>
  )
}

