"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ToastProvider"
import { supabase } from "@/lib/supabase/client"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loadingAction, setLoadingAction] = useState<null | "password-signin" | "password-signup" | "magic-link">(null)
  const [infoMessage, setInfoMessage] = useState<string>("")
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error && process.env.NODE_ENV !== "production") console.error("getSession error:", error)
      if (data.session) router.replace("/app")
    }

    run()
  }, [router, toast])

  const siteUrl = useMemo(() => {
    const env = process.env.NEXT_PUBLIC_SITE_URL?.trim()
    const base = env && env.length > 0 ? env : typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
    return base.replace(/\/+$/, "")
  }, [])

  const canSubmitEmail = useMemo(() => email.trim().length > 0, [email])
  const canSubmitPassword = useMemo(
    () => email.trim().length > 0 && password.trim().length > 0,
    [email, password]
  )

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loadingAction) return
    setInfoMessage("")

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
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") console.error("signInWithPassword error:", err)
      toast({
        title: "Couldn’t sign in",
        description: err?.message ?? "Something went wrong.",
        variant: "error",
      })
    } finally {
      setLoadingAction(null)
    }
  }

  const handlePasswordSignUp = async () => {
    if (loadingAction) return
    setInfoMessage("")

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
      setInfoMessage("Check your email to confirm")
      toast({
        title: "Check your email",
        description: "Check your email to confirm",
        variant: "success",
      })
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") console.error("signUp error:", err)
      toast({
        title: "Couldn’t create account",
        description: err?.message ?? "Something went wrong.",
        variant: "error",
      })
    } finally {
      setLoadingAction(null)
    }
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loadingAction) return
    setInfoMessage("")

    if (!canSubmitEmail) {
      toast({ title: "Missing email", description: "Enter your email address.", variant: "error" })
      return
    }

    setLoadingAction("magic-link")
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback`,
        },
      })

      if (error) throw error

      toast({
        title: "Magic link sent",
        description: "Check your email to finish signing in.",
        variant: "success",
      })
      setInfoMessage("Check your email to finish signing in.")
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") console.error("signInWithOtp error:", err)
      toast({
        title: "Couldn’t send magic link",
        description: err?.message ?? "Something went wrong.",
        variant: "error",
      })
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="container mx-auto max-w-md py-24 px-4">
      <div className="mb-12 text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          See all your subscriptions in one place
        </h1>
        <p className="text-lg text-muted-foreground">
          Track monthly spending, spot forgotten subscriptions, and stay in control of your money.
        </p>
      </div>
      <Card className="rounded-2xl shadow-sm border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use a password or a magic link.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="password" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="magic">Magic Link</TabsTrigger>
            </TabsList>

            <TabsContent value="password">
              <form onSubmit={handlePasswordSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    disabled={!!loadingAction}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={!!loadingAction}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={!!loadingAction}>
                  {loadingAction === "password-signin" ? "Signing in..." : "Sign in"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handlePasswordSignUp}
                  disabled={!!loadingAction}
                >
                  {loadingAction === "password-signup" ? "Creating..." : "Create account"}
                </Button>

                {infoMessage ? (
                  <p className="text-sm text-muted-foreground">{infoMessage}</p>
                ) : null}
              </form>
            </TabsContent>

            <TabsContent value="magic">
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="magic-email">Email</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    disabled={!!loadingAction}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={!!loadingAction}>
                  {loadingAction === "magic-link" ? "Sending..." : "Send magic link"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

