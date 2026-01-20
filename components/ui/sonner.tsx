"use client"

import { Toaster as SonnerToaster } from "sonner"

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "border bg-background text-foreground shadow-lg",
          description: "text-muted-foreground",
            actionButton:
              "border border-border/70 bg-muted/20 text-foreground hover:bg-accent hover:border-[color:color-mix(in_srgb,var(--accent)_24%,transparent)]",
            cancelButton: "border border-border/70 bg-transparent text-foreground/90 hover:bg-muted/30",
        },
      }}
    />
  )
}

