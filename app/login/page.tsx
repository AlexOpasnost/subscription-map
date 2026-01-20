"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ToastProvider"
import { supabase } from "@/lib/supabase/client"
import { getRedirectUrl } from "@/lib/getRedirectUrl"
import { humanizeError } from "@/lib/humanizeError"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loadingAction, setLoadingAction] = useState<null | "password-signin" | "password-signup" | "google">(null)
  const [inlineNotice, setInlineNotice] = useState<null | { title: string; description?: string; action?: "check-email" }>(null)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error && process.env.NODE_ENV !== "production") console.error("getSession error:", error)
      if (data.session) router.replace("/app")
    }

    run()
  }, [router])

  const siteUrl = useMemo(() => {
    const env = process.env.NEXT_PUBLIC_SITE_URL?.trim()
    const base = env && env.length > 0 ? env : typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
    return base.replace(/\/+$/, "")
  }, [])

  const canSubmitPassword = useMemo(
    () => email.trim().length > 0 && password.trim().length > 0,
    [email, password]
  )

  const errorMessage = (err: unknown): string => {
    if (!err) return ""
    if (typeof err === "string") return err
    if (err instanceof Error) return err.message ?? ""
    if (typeof err === "object" && err !== null && "message" in err) {
      const m = (err as { message?: unknown }).message
      return typeof m === "string" ? m : ""
    }
    return ""
  }

  const isEmailNotConfirmedError = (err: unknown) => {
    const msg = errorMessage(err).toLowerCase()
    return msg.includes("email not confirmed") || msg.includes("confirm your email")
  }

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loadingAction) return
    setInlineNotice(null)

    if (!canSubmitPassword) {
      toast({
        title: "Missing fields",
        description: "Enter email and password.",
        variant: "error",
      })
      return
    }

    setLoadingAction("password-signin")
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) throw error

      toast({ title: "Signed in", variant: "success" })
      router.push("/app")
    } catch (err: unknown) {
      if (process.env.NODE_ENV !== "production") console.error("signInWithPassword error:", err)

      if (isEmailNotConfirmedError(err)) {
        setInlineNotice({
          title: "Please confirm your email to sign in",
          description: "Check your inbox for the confirmation email. If you can’t find it, resend from the next screen.",
          action: "check-email",
        })
        toast({
          title: "Email not confirmed",
          description: "Confirm your email first, then sign in.",
          variant: "error",
        })
        return
      }

      toast({
        title: "Couldn’t sign in",
        description: humanizeError(err),
        variant: "error",
      })
    } finally {
      setLoadingAction(null)
    }
  }

  const handlePasswordSignUp = async () => {
    if (loadingAction) return
    setInlineNotice(null)

    if (!canSubmitPassword) {
      toast({
        title: "Missing fields",
        description: "Enter email and password.",
        variant: "error",
      })
      return
    }

    setLoadingAction("password-signup")
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback`,
        },
      })

      if (error) throw error

      if (data.session) {
        toast({ title: "Account created", description: "Signed in.", variant: "success" })
        router.push("/app")
        return
      }

      // Email confirmations enabled: Supabase returns no session.
      router.push(`/check-email?email=${encodeURIComponent(email.trim())}`)
    } catch (err: unknown) {
      if (process.env.NODE_ENV !== "production") console.error("signUp error:", err)
      toast({
        title: "Couldn’t create account",
        description: humanizeError(err),
        variant: "error",
      })
    } finally {
      setLoadingAction(null)
    }
  }

  const handleGoogleSignIn = async () => {
    if (loadingAction) return
    setInlineNotice(null)

    setLoadingAction("google")
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getRedirectUrl(),
        },
      })

      if (error) throw error
      // On success, Supabase redirects away to Google; no further action here.
    } catch (err: unknown) {
      if (process.env.NODE_ENV !== "production") console.error("signInWithOAuth(google) error:", err)
      toast({
        title: "Couldn’t continue with Google",
        description: humanizeError(err),
        variant: "error",
      })
      setLoadingAction(null)
    }
  }

  return (
    <div className="relative min-h-dvh px-4 py-10 sm:py-14 flex items-center justify-center">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(1100px 700px at 50% 35%, rgba(255,255,255,0.06), transparent 60%)," +
            "radial-gradient(900px 600px at 50% 35%, rgba(59,130,246,0.10), transparent 62%)," +
            "radial-gradient(900px 700px at 50% 120%, rgba(0,0,0,0.55), transparent 55%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-md">
        <div className="mb-10 text-center space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            See all your subscriptions in one place
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground">
            Track monthly spending, spot forgotten subscriptions, and stay in control of your money.
          </p>
        </div>

        <Card className="border-0 bg-[rgba(19,20,23,0.72)] shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-foreground/90">Sign in</CardTitle>
            <CardDescription>Use a password or continue with Google.</CardDescription>
          </CardHeader>
          <CardContent>
            {inlineNotice ? (
              <div className="mb-5 rounded-2xl bg-black/20 px-4 py-3">
                <div className="text-sm font-semibold text-foreground/90">{inlineNotice.title}</div>
                {inlineNotice.description ? (
                  <div className="mt-1 text-sm text-muted-foreground">{inlineNotice.description}</div>
                ) : null}
                {inlineNotice.action === "check-email" ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => router.push(`/check-email?email=${encodeURIComponent(email.trim())}`)}
                      disabled={!!loadingAction}
                    >
                      Check your email
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <form onSubmit={handlePasswordSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground/80">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={!!loadingAction}
                  className="bg-white/5 border-white/10 focus-visible:border-[color:var(--accent)] focus-visible:ring-[color:var(--accent)]/25"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground/80">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={!!loadingAction}
                  className="bg-white/5 border-white/10 focus-visible:border-[color:var(--accent)] focus-visible:ring-[color:var(--accent)]/25"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-[15px] font-semibold tracking-tight text-white border-0 bg-[linear-gradient(180deg,rgba(59,130,246,0.98),rgba(37,99,235,0.98))] shadow-[0_10px_30px_rgba(59,130,246,0.18)] hover:shadow-[0_14px_40px_rgba(59,130,246,0.24)] hover:brightness-105"
                disabled={!!loadingAction}
                loading={loadingAction === "password-signin"}
                loadingText="Signing in…"
              >
                Sign in
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full h-11 text-[15px] text-foreground/85 hover:text-foreground hover:bg-white/5"
                onClick={handlePasswordSignUp}
                disabled={!!loadingAction}
                loading={loadingAction === "password-signup"}
                loadingText="Creating…"
              >
                Create account
              </Button>

              <p className="text-sm text-muted-foreground">
                Not registered yet? Click <span className="font-medium text-foreground/90">Create account</span>.
              </p>

              <div className="flex items-center gap-3 pt-1">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-11 text-[15px] bg-transparent border-white/12 text-foreground/85 hover:text-foreground hover:bg-white/5"
                onClick={handleGoogleSignIn}
                disabled={!!loadingAction}
                loading={loadingAction === "google"}
                loadingText="Redirecting…"
              >
                Continue with Google
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

