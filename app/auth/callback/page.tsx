"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [msg, setMsg] = useState("Signing you in…")

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check for code in query params (PKCE flow - modern, recommended)
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get("code")

        if (code) {
          // PKCE flow: Exchange code for session
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)

          if (error) {
            console.error("Error exchanging code for session:", error)
            setMsg("Authentication failed. Redirecting to login…")
            setTimeout(() => router.replace("/login"), 1000)
            return
          }

          if (data.session) {
            // Success - redirect to main app
            router.replace("/app")
            return
          } else {
            setMsg("No session found. Redirecting to login…")
            setTimeout(() => router.replace("/login"), 1000)
            return
          }
        }

        // Check for hash-based flow (implicit flow - older mobile email clients)
        // Supabase client has detectSessionInUrl: true, so it should auto-detect
        // But we'll also manually check and set session if needed
        if (window.location.hash) {
          // Parse hash parameters manually
          const hashParams = new URLSearchParams(window.location.hash.substring(1))
          const accessToken = hashParams.get("access_token")
          const refreshToken = hashParams.get("refresh_token")

          if (accessToken && refreshToken) {
            // Set session manually for hash-based flow
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })

            if (error) {
              console.error("Error setting session from hash:", error)
              setMsg("Authentication failed. Redirecting to login…")
              setTimeout(() => router.replace("/login"), 1000)
              return
            }

            if (data.session) {
              // Success - redirect to main app
              router.replace("/app")
              return
            }
          }
        }

        // Also check if Supabase auto-detected the session (for hash-based flows)
        // This handles cases where detectSessionInUrl worked automatically
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.replace("/app")
          return
        }

        // No code or hash found - show message and redirect
        setMsg("No authentication code found. Redirecting to login…")
        setTimeout(() => router.replace("/login"), 1000)
      } catch (error) {
        console.error("Error in auth callback:", error)
        setMsg("Authentication error. Redirecting to login…")
        setTimeout(() => router.replace("/login"), 1000)
      }
    }

    // Only run on client side
    if (typeof window !== "undefined") {
      handleAuthCallback()
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
