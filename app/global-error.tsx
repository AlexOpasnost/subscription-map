"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    try {
      Sentry.captureException(error)
    } catch {
      // best-effort
    }
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto max-w-md py-24 px-4">
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold tracking-tight">Something went wrong</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The app hit an unexpected error. Please try again.
            </p>

            <div className="mt-6">
              <Button type="button" onClick={reset} className="w-full">
                Try again
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}

