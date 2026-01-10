"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface CheckboxProps extends React.ComponentProps<"input"> {
  label?: string
}

function Checkbox({ className, label, ...props }: CheckboxProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border-input accent-primary cursor-pointer",
          className
        )}
        {...props}
      />
      {label && (
        <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {label}
        </span>
      )}
    </label>
  )
}

export { Checkbox }

