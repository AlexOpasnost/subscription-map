"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

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

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          router.replace("/app")
          return
        }

        router.replace("/login")
      } catch (error: any) {
        if (process.env.NODE_ENV !== "production") console.error("Error in auth callback:", error)
        const description =
          typeof error?.message === "string" && error.message.trim().length > 0
            ? error.message
            : "Authentication failed. Please try again."
        setMsg(`Authentication failed: ${description}`)
        window.setTimeout(() => router.replace("/login"), 1200)
      }
    }

    handleAuthCallback()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
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
        <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
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
