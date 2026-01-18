"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ToastProvider"
import { supabase } from "@/lib/supabase/client"
import { humanizeError } from "@/lib/humanizeError"
import { isEmailConfirmed } from "@/lib/isEmailConfirmed"

function CheckEmailInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const emailFromQuery = (searchParams.get("email") ?? "").trim()
  const [email, setEmail] = useState<string>(emailFromQuery)
  const [checkingSession, setCheckingSession] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resending, setResending] = useState(false)

  const displayEmail = useMemo(() => (email.trim() ? email.trim() : null), [email])

  useEffect(() => {
    const run = async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        const user = data.user
        const userEmail = typeof user?.email === "string" ? user.email : ""
        if (!emailFromQuery && userEmail) setEmail(userEmail)

        const isConfirmed = isEmailConfirmed(user)
        setConfirmed(isConfirmed)
        if (isConfirmed) {
          router.replace("/email-confirmed")
        }
      } catch {
        // If the user isn't signed in yet, that's totally fine for this page.
      } finally {
        setCheckingSession(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = window.setInterval(() => setResendCooldown((s) => s - 1), 1000)
    return () => window.clearInterval(t)
  }, [resendCooldown])

  const handleResend = async () => {
    if (resending) return
    if (resendCooldown > 0) return

    const safeEmail = (displayEmail ?? "").trim()
    if (!safeEmail) {
      toast({
        title: "Enter your email",
        description: "Add the email you used to sign up, then resend the confirmation.",
        variant: "error",
      })
      return
    }

    setResending(true)
    setResendCooldown(30)
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: safeEmail })
      if (error) throw error
      toast({
        title: "Confirmation email sent",
        description: "Check your inbox (and spam) for the confirmation email.",
        variant: "success",
      })
    } catch (err) {
      toast({
        title: "Couldn’t resend email",
        description: humanizeError(err),
        variant: "error",
      })
      setResendCooldown(0)
    } finally {
      setResending(false)
    }
  }

  const openGmail = () => window.open("https://mail.google.com/mail/u/0/#inbox", "_blank", "noopener,noreferrer")

  return (
    <div className="container mx-auto max-w-md py-16 sm:py-24 px-4">
      <div className="mb-10 text-center space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Check your email</h1>
        <p className="text-base sm:text-lg text-muted-foreground">
          We sent you a confirmation link. Confirming helps keep your account secure.
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm border bg-card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xl">Confirm your address</CardTitle>
            <Badge variant={confirmed ? "default" : "secondary"} className="shrink-0">
              {confirmed ? "Confirmed" : "Waiting"}
            </Badge>
          </div>
          <CardDescription>
            Open the email, click the confirmation link, and we’ll finish signing you in.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="check-email-address">Email</Label>
            <Input
              id="check-email-address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={resending}
            />
            <p className="text-xs text-muted-foreground">
              We’ll resend the confirmation to this address.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" onClick={openGmail} disabled={checkingSession}>
              Open Gmail
            </Button>
            <Button asChild type="button" variant="outline" disabled={checkingSession}>
              <Link href="mailto:">Open Mail</Link>
            </Button>
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={handleResend}
            loading={resending}
            loadingText={resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resending…"}
            disabled={resendCooldown > 0}
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend confirmation email"}
          </Button>

          <div className="pt-2 border-t space-y-2">
            <p className="text-xs text-muted-foreground">
              Already confirmed? You can{" "}
              <Link className="text-foreground underline underline-offset-4" href="/login">
                sign in
              </Link>{" "}
              anytime.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function CheckEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-md py-16 sm:py-24 px-4">
          <div className="mb-10 text-center space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Check your email</h1>
            <p className="text-base text-muted-foreground">Loading…</p>
          </div>
        </div>
      }
    >
      <CheckEmailInner />
    </Suspense>
  )
}

