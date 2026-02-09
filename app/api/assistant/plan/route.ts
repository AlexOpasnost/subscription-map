import { NextResponse, type NextRequest } from "next/server"
import OpenAI from "openai"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

import { requireServerEnv, requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/env"
import { parsePlanSafe } from "@/lib/assistant/planSchema"
import { getUserIdFromAccessToken } from "@/lib/supabase/userFromBearer"

function getFallbackPlan() {
  const r = parsePlanSafe({})
  return r.ok ? r.plan : r.fallbackPlan
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\\s+(.+)$/.exec(h)
  return m ? m[1].trim() : null
}

function extractFirstJsonObject(text: string): unknown | null {
  const s = text.trim()
  const start = s.indexOf("{")
  if (start < 0) return null

  // Bracket matching to find the first complete JSON object.
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === "\\\\") {
        escaped = true
      } else if (ch === "\"") {
        inString = false
      }
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
  'You are "S-Assistant", a personal executive assistant.',
  `Today is ${new Date().toISOString().slice(0, 10)} (UTC).`,
  "",
  "Return ONLY JSON matching this schema (no markdown, no commentary):",
  "{",
  '  "actions": [',
  "    {",
  '      "type": "add_subscription" | "create_task" | "create_event" | "create_note" | "clarify" | "query",',
  '      "title": string,',
  '      "service": string | null,',
  '      "plan": string | null,',
  '      "price_cents": number | null,',
  '      "currency": "USD" | "EUR" | "RUB" | null,',
  '      "period": "monthly" | "yearly" | null,',
  '      "category": string | null,',
  '      "due_date": string | null,',
  '      "start_datetime": string | null,',
  '      "end_datetime": string | null,',
  '      "remind_before_days": number | null,',
  '      "destination": ["supabase","notion","google_calendar"],',
  '      "details": string | null',
  "    }",
  "  ],",
  '  "reply": string',
  "}",
  "",
  "Rules:",
  "- Never invent tokens/IDs/credentials.",
  "- If missing critical info, return a single clarify action and reply asking the user.",
  "- Prefer minimal actions.",
  "- Dates: if day/month without year, assume nearest future date. If 'in N days', compute it. If 'N days before', set remind_before_days=N.",
  "- If user asks 'what am I spending', return a single query action.",
].join("\\n")

export async function POST(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ error: "Not authenticated", plan: getFallbackPlan() }, { status: 401 })
  let userId = ""
  try {
    // Validate token (keeps this endpoint protected and cost-contained).
    userId = await getUserIdFromAccessToken(token)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Not authenticated"
    return NextResponse.json({ error: msg, plan: getFallbackPlan() }, { status: 401 })
  }

  let body: unknown
  try {
    body = (await req.json()) as unknown
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", plan: getFallbackPlan() }, { status: 400 })
  }

  const message = typeof (body as any)?.message === "string" ? String((body as any).message).trim() : ""
  if (!message) {
    return NextResponse.json({ error: "Missing `message`", plan: getFallbackPlan() }, { status: 400 })
  }

  try {
    const apiKey = requireServerEnv("OPENAI_API_KEY", "Set it in Vercel and .env.local")
    const model = (process.env.OPENAI_MODEL ?? "").trim() || "gpt-4.1-mini"

    const openai = new OpenAI({ apiKey })
    const resp = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
    })

    const content = resp.choices?.[0]?.message?.content ?? ""
    const raw = typeof content === "string" ? content.trim() : ""
    const json = raw ? extractFirstJsonObject(raw) : null
    if (!json) {
      return NextResponse.json(
        { error: "Planner returned invalid JSON. Please rephrase.", plan: getFallbackPlan() },
        { status: 400 }
      )
    }

    // Best-effort usage logging (never blocks the response).
    try {
      const supabase = createClient(requireSupabaseUrl(), requireSupabaseAnonKey(), {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const usage = (resp as any)?.usage ?? {}
      const inputTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null
      const outputTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : null
      const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null
      const requestId = typeof (resp as any)?.id === "string" ? String((resp as any).id) : crypto.randomUUID()
      await supabase.from("ai_usage").insert({
        user_id: userId,
        request_id: requestId,
        model: model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost_usd: null,
      })
    } catch {
      // ignore
    }

    const validated = parsePlanSafe(json)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error, plan: validated.fallbackPlan }, { status: 400 })
    }

    return NextResponse.json({ plan: validated.plan })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Planning failed"
    return NextResponse.json({ error: msg, plan: getFallbackPlan() }, { status: 500 })
  }
}

