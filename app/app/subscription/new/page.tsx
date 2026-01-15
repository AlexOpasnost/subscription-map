"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import PageShell from "@/components/PageShell"

export default function NewSubscriptionPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/app")
  }, [router])

  return (
    <PageShell>
      <p className="text-muted-foreground">Redirecting...</p>
    </PageShell>
  )
}
