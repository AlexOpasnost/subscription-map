import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
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
  const Comp = asChild ? Slot : "button"
  const isLoading = !!loading
  const isDisabled = !!disabled || isLoading
  const content = isLoading && typeof loadingText === "string" && loadingText.trim().length > 0 ? loadingText : children

  const slottableChild = React.useMemo(() => {
    if (!asChild) return null
    const arr = React.Children.toArray(children).filter((c) => {
      if (c === null || c === undefined) return false
      if (typeof c === "string") return c.trim().length > 0
      return true
    })
    const firstElement = arr.find((c) => React.isValidElement(c))
    return (firstElement as React.ReactElement) ?? null
  }, [asChild, children])

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={isLoading ? "true" : "false"}
      aria-busy={isLoading || undefined}
      aria-disabled={isDisabled || undefined}
      disabled={!asChild ? isDisabled : undefined}
      className={cn(
        buttonVariants({ variant, size, className }),
        isDisabled && asChild ? "pointer-events-none opacity-50" : ""
      )}
      {...props}
    >
      {isLoading && !asChild ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {asChild ? slottableChild : content}
    </Comp>
  )
}

export { Button, buttonVariants }
