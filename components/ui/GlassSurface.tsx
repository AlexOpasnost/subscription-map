import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const glassSurfaceVariants = cva(
  "relative rounded-[24px] border border-white/10 backdrop-blur-xl",
  {
    variants: {
      variant: {
        elevated:
          "bg-[rgba(19,20,23,0.72)] shadow-[0_20px_70px_rgba(0,0,0,0.55)]",
        subtle:
          "bg-white/[0.04] shadow-[0_18px_70px_rgba(0,0,0,0.45)]",
      },
      highlight: {
        true:
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(180deg,rgba(255,255,255,0.10),transparent_55%)] before:opacity-35",
        false: "",
      },
    },
    defaultVariants: {
      variant: "elevated",
      highlight: true,
    },
  }
)

export interface GlassSurfaceProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassSurfaceVariants> {}

export function GlassSurface({
  className,
  variant,
  highlight,
  ...props
}: GlassSurfaceProps) {
  return (
    <div
      data-slot="glass-surface"
      className={cn(glassSurfaceVariants({ variant, highlight }), className)}
      {...props}
    />
  )
}

