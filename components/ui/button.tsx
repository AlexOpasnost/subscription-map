import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { SafeSlot } from "@/components/ui/safe-slot"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        primary:
          "border-0 text-white bg-[linear-gradient(180deg,rgba(59,130,246,0.98),rgba(37,99,235,0.98))] shadow-[0_10px_30px_rgba(59,130,246,0.16)] hover:shadow-[0_14px_40px_rgba(59,130,246,0.22)] hover:brightness-105 active:brightness-95",
        default:
          "border border-border/70 bg-muted/20 text-foreground/90 shadow-xs hover:bg-accent hover:border-[color:color-mix(in_srgb,var(--accent)_28%,transparent)]",
        destructive:
          "border border-red-500/25 text-foreground/90 bg-[linear-gradient(180deg,rgba(220,38,38,0.20),rgba(127,29,29,0.20))] shadow-[0_18px_60px_rgba(0,0,0,0.45)] hover:border-red-400/30 hover:brightness-105 focus-visible:ring-red-500/20",
        outline:
          "border border-white/12 bg-transparent text-foreground/85 shadow-xs hover:text-foreground hover:bg-white/5",
        secondary:
          "bg-muted/20 text-foreground/85 hover:bg-accent",
        ghost:
          "text-foreground/85 hover:text-foreground hover:bg-white/5",
        link: "text-foreground/90 underline-offset-4 hover:underline hover:text-[color:var(--accent)]",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  loadingText,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
    loadingText?: string
  }) {
  const isLoading = !!loading
  const normalizedChildren = React.Children.toArray(children)
  const canSlot =
    asChild &&
    normalizedChildren.length === 1 &&
    React.isValidElement(normalizedChildren[0])
  const Comp = canSlot ? SafeSlot : "button"

  if (asChild && !canSlot && process.env.NODE_ENV !== "production") {
    console.error("[ui/Button] Invalid `asChild` child; falling back to <button> to avoid a crash.", {
      count: normalizedChildren.length,
    })
  }

  const isDisabled = !!disabled || (!canSlot && isLoading)
  const content =
    !canSlot && isLoading && typeof loadingText === "string" && loadingText.trim().length > 0 ? loadingText : children

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={isLoading ? "true" : "false"}
      aria-busy={isLoading || undefined}
      aria-disabled={isDisabled || undefined}
      disabled={!canSlot ? isDisabled : undefined}
      className={cn(
        buttonVariants({ variant, size, className }),
        isDisabled && canSlot ? "pointer-events-none opacity-50" : ""
      )}
      {...props}
    >
      {!canSlot && isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {content}
    </Comp>
  )
}

export { Button, buttonVariants }
