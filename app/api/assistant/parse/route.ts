import { NextResponse, type NextRequest } from "next/server"
import OpenAI from "openai"

import {
  normalizeAbsoluteUrl,
  requireServerEnv,
  requireSupabaseAnonKey,
  requireSupabaseServiceRoleKey,
  requireSupabaseUrl,
} from "@/lib/env"
import { getUserIdFromAccessToken } from "@/lib/supabase/userFromBearer"
import { ActionSchema, unsupported, type Action } from "@/lib/assistant/actionSchema"

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function extractFirstJsonObject(text: string): unknown | null {
  const s = text.trim()
  const start = s.indexOf("{")
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === "\"") inString = false
      continue
    }
    if (ch === "\"") {
      inString = true
      continue
    }
    if (ch === "{") depth++
    if (ch === "}") {
      depth--
      if (depth === 0) {
        const slice = s.slice(start, i + 1)
        try {
          return JSON.parse(slice) as unknown
        } catch {
          return null
        }
      }
    }
  }
  return null
}

const SYSTEM_PROMPT = [
  "You are a command-to-action AI secretary for a subscription/task tracker.",
  `Today is ${new Date().toISOString().slice(0, 10)} (UTC).`,
  "",
  "You MUST return ONLY a single JSON object (no markdown, no explanations).",
  "",
  "Return EXACTLY one Action object matching this TypeScript union:",
  "type Action =",
  `| { type: "add_task"; title: string; due_date?: string; remind_days_before?: number; notes?: string }`,
  `| { type: "add_subscription"; service: string; plan?: string; price_cents?: number; period?: "monthly" | "yearly"; category?: string; next_renewal?: string; remind_days_before?: number }`,
  `| { type: "add_plan"; title: string; date?: string; notes?: string }`,
  `| { type: "question_spending"; timeframe?: "month" | "year" | "all" }`,
  `| { type: "timeline"; from?: string; to?: string }`,
  `| { type: "unsupported"; reason: string; suggestions: string[] }`,
  "",
  "Rules:",
  "- Support BOTH English and Russian input.",
  "- Dates MUST be ISO YYYY-MM-DD. If year is missing (e.g. 'February 22' / '22 февраля'), infer the nearest future date.",
  "- 'three days before' / 'за 3 дня' => remind_days_before: 3",
  "- If intent is unclear OR critical info missing (e.g. subscription price/period), return type=unsupported with a clear reason and 2-4 suggestions.",
  "- Never invent tokens, IDs, URLs, credentials.",
  "",
  "Examples (output must be JSON only):",
  `Input: "Add Spotify subscription, $14.99 monthly"`,
  `Output: {"type":"add_subscription","service":"Spotify","price_cents":1499,"period":"monthly"}`,
  `Input: "Remind me to cancel Netflix on February 22"`,
  `Output: {"type":"add_task","title":"Cancel Netflix","due_date":"2026-02-22"}`,
  `Input: "Сколько я трачу в месяц?"`,
  `Output: {"type":"question_spending","timeframe":"month"}`,
].join("\n")

function normalizeAction(action: Action): Action {
  // Ensure the model doesn't sneak nulls into optional-only fields.
  if (action.type === "add_subscription") {
    const plan = (action as any).plan
    if (plan === null) delete (action as any).plan
  }
  return action
}

export async function POST(req: NextRequest) {
  try {
    // Fail early for required env vars (as requested).
    requireServerEnv("OPENAI_API_KEY")
    requireSupabaseServiceRoleKey()
    normalizeAbsoluteUrl(requireServerEnv("APP_URL"))
    requireSupabaseUrl()
    requireSupabaseAnonKey()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Missing environment variables."
    return NextResponse.json({ error: msg, action: unsupported(msg) }, { status: 500 })
  }

  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ error: "Not authenticated", action: unsupported("Not authenticated") }, { status: 401 })
  try {
    await getUserIdFromAccessToken(token)
  } catch {
    return NextResponse.json({ error: "Not authenticated", action: unsupported("Not authenticated") }, { status: 401 })
  }

  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", action: unsupported("Invalid JSON body") }, { status: 400 })
  }

  const text = typeof (body as any)?.text === "string" ? String((body as any).text).trim() : ""
  if (!text) {
    return NextResponse.json({ error: "Missing `text`", action: unsupported("Missing `text`") }, { status: 400 })
  }

  const apiKey = requireServerEnv("OPENAI_API_KEY")
  const model = (process.env.OPENAI_MODEL ?? "").trim() || "gpt-4.1-mini"
  const openai = new OpenAI({ apiKey })

  try {
    const resp = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    })

    const raw = String(resp.choices?.[0]?.message?.content ?? "").trim()
    const json = extractFirstJsonObject(raw)
    if (!json) {
      return NextResponse.json({ error: "Model returned invalid JSON", action: unsupported("Model returned invalid JSON") }, { status: 400 })
    }

    const parsed = ActionSchema.safeParse(json)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
      return NextResponse.json({ error: msg, action: unsupported("Unsupported or invalid command") }, { status: 400 })
    }

    return NextResponse.json({ action: normalizeAction(parsed.data) })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "OpenAI request failed"
    return NextResponse.json({ error: msg, action: unsupported(msg) }, { status: 500 })
  }
}

