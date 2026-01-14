"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { signInWithEmail } from "@/lib/supabase/auth"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage("")

    const { error } = await signInWithEmail(email)

    if (error) {
      setMessage(`Error: ${error.message}`)
      setLoading(false)
    } else {
      setMessage("Check your email for the magic link!")
      setLoading(false)
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
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {message && (
              <p
                className={`text-sm ${
                  message.includes("Error")
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Continue with email"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

