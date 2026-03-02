import "server-only"

import { Resend } from "resend"

import { requireServerEnv } from "@/lib/env"

export type SendEmailInput = {
  to: string
  subject: string
  text: string
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const apiKey = requireServerEnv("RESEND_API_KEY")
  const from = requireServerEnv("EMAIL_FROM", "Example: notify@yourdomain.com")
  const resend = new Resend(apiKey)

  const res = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  })

  if ((res as any)?.error) {
    const msg = typeof (res as any).error?.message === "string" ? String((res as any).error.message) : "Resend send failed"
    throw new Error(msg)
  }

  const id = typeof (res as any)?.data?.id === "string" ? String((res as any).data.id) : ""
  if (!id) throw new Error("Resend send returned no id")
  return { id }
}

