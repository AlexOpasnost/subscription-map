"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { humanizeError } from "@/lib/humanizeError"

function shouldShowEmailConfirmed(type: string | null): boolean {
  // Supabase confirmation links typically include a `type` query param (e.g. `signup`).
  return type === "signup" || type === "invite"
}

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ranRef = useRef(false)
  const [msg, setMsg] = useState("Signing you in…")

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const handleAuthCallback = async () => {
      try {
        const code = searchParams.get("code")
        const type = searchParams.get("type")

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          router.replace(shouldShowEmailConfirmed(type) ? "/email-confirmed" : "/app")
          return
        }

        router.replace("/login")
      } catch (error: unknown) {
        if (process.env.NODE_ENV !== "production") console.error("Error in auth callback:", error)
        setMsg("We couldn’t finish signing you in.")
        window.setTimeout(() => router.replace("/login"), 1200)
        // Use toast-like phrasing without leaking raw provider errors.
        const friendly = humanizeError(error)
        if (friendly && friendly !== "Something went wrong. Please try again.") {
          setMsg(`We couldn’t finish signing you in. ${friendly}`)
        }
      }
    }

    handleAuthCallback()
  }, [router, searchParams])

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
      <div className="text-center space-y-2">
        <div className="text-lg font-semibold">{msg}</div>
        <div className="text-sm text-muted-foreground">Please wait.</div>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
          <div className="text-center space-y-2">
            <div className="text-lg font-semibold">Signing you in…</div>
            <div className="text-sm text-muted-foreground">Please wait.</div>
          </div>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  )
}
