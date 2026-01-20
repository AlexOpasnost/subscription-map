import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        default: "border-border/70 bg-muted/40 text-foreground/90",
        secondary: "border-border/70 bg-muted/20 text-muted-foreground",
        success:
          "border-[color:color-mix(in_srgb,var(--success)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--success)_16%,transparent)] text-[color:var(--success)]",
        warning:
          "border-[color:color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--accent)]",
        destructive:
          "border-destructive/30 bg-destructive/15 text-destructive",
        outline: "border-border/60 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
