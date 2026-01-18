"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase/client"
import { isEmailConfirmed } from "@/lib/isEmailConfirmed"

export default function EmailConfirmedPage() {
  const router = useRouter()
  const [status, setStatus] = useState<"checking" | "ok" | "signed-out">("checking")
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          setStatus("signed-out")
          return
        }

        const { data: userData } = await supabase.auth.getUser()
        const confirmed = isEmailConfirmed(userData.user)
        setStatus(confirmed ? "ok" : "ok")

        timeoutRef.current = window.setTimeout(() => router.replace("/app"), 1400)
      } finally {
        // no-op
      }
    }

    run()
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [router])

  return (
    <div className="container mx-auto max-w-md py-16 sm:py-24 px-4">
      <div className="mb-10 text-center space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Email confirmed</h1>
        <p className="text-base sm:text-lg text-muted-foreground">You’re all set. We’re taking you to your dashboard.</p>
      </div>

      <Card className="rounded-2xl shadow-sm border bg-card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xl">Welcome!</CardTitle>
            <Badge variant="default" className="shrink-0">
              Confirmed
            </Badge>
          </div>
          <CardDescription>
            {status === "signed-out"
              ? "Looks like you’re signed out. Please sign in to continue."
              : "Redirecting automatically…"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {status === "signed-out" ? (
            <Button className="w-full" onClick={() => router.push("/login")}>
              Go to sign in
            </Button>
          ) : (
            <Button className="w-full" onClick={() => router.push("/app")}>
              Continue to dashboard
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            If nothing happens, use the button above.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

