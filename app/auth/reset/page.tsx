"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ToastProvider"
import { supabase } from "@/lib/supabase/client"

export default function ResetPasswordPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const code = params.get("code")
        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        }

        const { data } = await supabase.auth.getSession()
        setHasSession(!!data.session)
      } finally {
        setChecking(false)
      }
    }

    run()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return

    if (!hasSession) {
      toast({
        title: "Reset link expired",
        description: "Request a new reset email and try again.",
        variant: "error",
      })
      return
    }

    if (newPassword.trim().length < 8) {
      toast({
        title: "Password too short",
        description: "Use at least 8 characters.",
        variant: "error",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don’t match",
        description: "Re-enter your new password.",
        variant: "error",
      })
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      toast({ title: "Couldn’t update password", description: error.message, variant: "error" })
      setSaving(false)
      return
    }

    toast({ title: "Password updated", variant: "success" })
    router.replace("/app")
  }

  return (
    <div className="container mx-auto max-w-md py-24 px-4">
      <Card className="rounded-2xl shadow-sm border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {checking ? (
            <p className="text-sm text-muted-foreground">Checking reset link…</p>
          ) : !hasSession ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This reset link is invalid or expired.
              </p>
              <Button asChild className="w-full">
                <Link href="/login">Back to login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={saving}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={saving}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving..." : "Save new password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

