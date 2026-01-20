"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[96px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground transition-[color,box-shadow,background-color,border-color] outline-none focus-visible:border-[color:var(--accent)] focus-visible:ring-[color:var(--accent)]/25 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }

