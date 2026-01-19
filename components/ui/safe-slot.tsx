"use client"

import * as React from "react"
import { Slot as RadixSlot } from "@radix-ui/react-slot"

// SafeSlot exists to prevent Radix Slot's internal React.Children.only crash when
// `asChild` accidentally receives text, fragments, conditionals, or multiple children.
export function SafeSlot({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadixSlot> & { children?: React.ReactNode }) {
  const count = React.Children.count(children)

  let only: unknown = null
  if (count === 1) {
    try {
      only = React.Children.only(children)
    } catch {
      only = null
    }
  }

  const safeChild =
    !only || !React.isValidElement(only) || only.type === React.Fragment ? (
      <span>{children}</span>
    ) : (
      only
    )

  return <RadixSlot {...props}>{safeChild}</RadixSlot>
}

