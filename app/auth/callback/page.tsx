"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [msg, setMsg] = useState("Signing you in…")

  useEffect(() => {
    let cancelled = false

    const handleAuthCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get("code")
        const tokenHash = urlParams.get("token_hash")

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          router.replace("/app")
          return
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type: "magiclink",
            token_hash: tokenHash,
          })
          if (error) throw error
          router.replace("/app")
          return
        }

        throw new Error("Missing authentication parameters.")
      } catch (error: any) {
        if (process.env.NODE_ENV !== "production") console.error("Error in auth callback:", error)

        const description =
          typeof error?.message === "string" && error.message.trim().length > 0
            ? error.message
            : "Authentication failed. Please try again."

        if (!cancelled) {
          setMsg(`Authentication failed: ${description}`)
          // Give the user a moment to read the error before redirecting.
          window.setTimeout(() => {
            router.replace("/login")
          }, 1200)
        }
      }
    }

    handleAuthCallback()

    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="text-center space-y-2">
        <div className="text-lg font-semibold">{msg}</div>
        <div className="text-sm text-muted-foreground">Please wait.</div>
      </div>
    </div>
  )
}
