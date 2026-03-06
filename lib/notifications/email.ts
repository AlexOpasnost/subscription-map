import "server-only"

import { Resend } from "resend"

export type SendEmailInput = {
  to: string
  subject: string
  text: string
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; code: "NOT_CONFIGURED" | "SEND_FAILED" }

function getEnv(name: string): string {
  const v = process.env[name]
  return typeof v === "string" ? v.trim() : ""
}

export async function sendEmailIfConfigured(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = getEnv("RESEND_API_KEY")
  const from = getEnv("DEFAULT_FROM_EMAIL") || getEnv("EMAIL_FROM")
  if (!apiKey || !from) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      error: "Email provider not configured (missing RESEND_API_KEY or DEFAULT_FROM_EMAIL).",
    }
  }
  const resend = new Resend(apiKey)

  try {
    const res = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    })

    if ((res as any)?.error) {
      const msg = typeof (res as any).error?.message === "string" ? String((res as any).error.message) : "Resend send failed"
      return { ok: false, code: "SEND_FAILED", error: msg }
    }

    const id = typeof (res as any)?.data?.id === "string" ? String((res as any).data.id) : ""
    if (!id) return { ok: false, code: "SEND_FAILED", error: "Resend send returned no id" }
    return { ok: true, id }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Email send failed"
    return { ok: false, code: "SEND_FAILED", error: msg }
  }
}

