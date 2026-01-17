"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ToastProvider"
import { supabase } from "@/lib/supabase/client"

function isEmailConfirmed(user: any): boolean {
  // Supabase user shape differs slightly by context; cover common fields.
  return !!(user?.email_confirmed_at || user?.confirmed_at)
}

function ConfirmEmailInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const emailFromQuery = (searchParams.get("email") ?? "").trim()
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [resendCooldown, setResendCooldown] = useState(0)
  const pollingRef = useRef<number | null>(null)

  const displayEmail = useMemo(() => signedInEmail ?? (emailFromQuery || null), [signedInEmail, emailFromQuery])

  const checkStatus = async () => {
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error) throw error

      const user = data.user
      setSignedInEmail(user?.email ?? null)
      const isConfirmed = isEmailConfirmed(user)
      setConfirmed(isConfirmed)

      if (isConfirmed) {
        setChecking(false)
        window.setTimeout(() => router.replace("/app"), 1000)
      }
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") console.error("confirm-email getUser error:", err)
      // If not signed in, keep showing instructions (but no polling-based confirmation).
      setSignedInEmail(null)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    // Start polling every 4s (only meaningful if user is signed in).
    checkStatus()
    pollingRef.current = window.setInterval(() => {
      checkStatus()
    }, 4000)

    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = window.setInterval(() => setResendCooldown((s) => s - 1), 1000)
    return () => window.clearInterval(t)
  }, [resendCooldown])

  const handleResend = async () => {
    if (resendCooldown > 0) return

    const email = (displayEmail ?? "").trim()
    if (!email) {
      toast({
        title: "Missing email",
        description: "Go back to sign in and enter your email, then try again.",
        variant: "error",
      })
      return
    }

    setResendCooldown(30)
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      })
      if (error) throw error

      toast({
        title: "Confirmation email sent",
        description: "Check your inbox (and spam) for the confirmation email.",
        variant: "success",
      })
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") console.error("resend signup email error:", err)
      toast({
        title: "Couldn’t resend email",
        description: err?.message ?? "Something went wrong.",
        variant: "error",
      })
      setResendCooldown(0)
    }
  }

  const openGmail = () => {
    window.open("https://mail.google.com/mail/u/0/#inbox", "_blank", "noopener,noreferrer")
  }

  const openMailApp = () => {
    window.location.href = "mailto:"
  }

  const statusLabel = confirmed ? "Confirmed" : "Waiting for confirmation"

  return (
    <div className="container mx-auto max-w-md py-24 px-4">
      <div className="mb-12 text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Confirm your email</h1>
        <p className="text-lg text-muted-foreground">
          We sent you an email. Confirming keeps your account secure and lets you access the app.
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm border bg-card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xl">Check your inbox</CardTitle>
            <Badge variant={confirmed ? "default" : "secondary"} className="shrink-0">
              {statusLabel}
            </Badge>
          </div>
          <CardDescription>
            1) Check inbox (and spam) • 2) Click the confirmation link • 3) Return here (auto-detect) or open the app again.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg border p-3 text-sm">
            <div className="text-muted-foreground">Email</div>
            <div className="font-medium break-all">{displayEmail ?? "Not signed in"}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" onClick={openGmail} disabled={checking}>
              Open Gmail
            </Button>
            <Button type="button" variant="outline" onClick={openMailApp} disabled={checking}>
              Open Mail
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              className="flex-1"
              onClick={handleResend}
              disabled={resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
            </Button>
            <Button type="button" variant="outline" onClick={checkStatus} disabled={checking}>
              Refresh status
            </Button>
          </div>

          {!signedInEmail ? (
            <div className="pt-2 border-t">
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default function ConfirmEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-md py-24 px-4">
          <div className="mb-12 text-center space-y-4">
            <h1 className="text-4xl font-bold tracking-tight">Confirm your email</h1>
            <p className="text-lg text-muted-foreground">Loading…</p>
          </div>
        </div>
      }
    >
      <ConfirmEmailInner />
    </Suspense>
  )
}

