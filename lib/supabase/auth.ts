"use client"

import { supabase } from "./client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"

export function getSiteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env && env.trim().length > 0) {
    return env.replace(/\/+$/, "")
  }
  if (typeof window !== "undefined") {
    return window.location.origin
  }
  return "http://localhost:3000"
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.replace("/login")
  }

  return { user, loading, signOut }
}

function getAuthRedirectUrl(pathname: "/auth/callback" | "/auth/reset"): string {
  return `${getSiteUrl()}${pathname}`
}

export async function signInWithEmail(email: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getAuthRedirectUrl("/auth/callback"),
    },
  })
}

export async function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthRedirectUrl("/auth/reset"),
  })
}
