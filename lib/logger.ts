import "server-only"

import crypto from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { NextRequest } from "next/server"

type LogLevel = "info" | "warn" | "error"

function safeJson(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object") return {}
  try {
    return v as Record<string, unknown>
  } catch {
    return {}
  }
}

function getRequestIdFromReq(req?: NextRequest): string {
  const existing = req?.headers.get("x-request-id") || req?.headers.get("x-vercel-id")
  return existing?.trim() || crypto.randomUUID()
}

function getPathFromReq(req?: NextRequest): string | null {
  const url = req?.nextUrl?.pathname || req?.headers.get("x-url") || req?.headers.get("referer")
  return url ? String(url).slice(0, 500) : null
}

async function insertAppLog(input: {
  userId?: string | null
  level: LogLevel
  area: string
  message: string
  meta?: Record<string, unknown>
}) {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from("app_logs").insert({
      user_id: input.userId ?? null,
      level: input.level,
      area: input.area.slice(0, 80),
      message: input.message.slice(0, 2000),
      meta: input.meta ?? {},
    })
  } catch {
    // best-effort; never break request path
  }
}

async function log(
  level: LogLevel,
  area: string,
  message: string,
  meta?: Record<string, unknown>,
  userId?: string | null,
  req?: NextRequest
) {
  const request_id = getRequestIdFromReq(req)
  const path = getPathFromReq(req)
  const payload = { request_id, path, ...safeJson(meta) }

  if (level === "error") console.error(`[${area}] ${message}`, payload)
  else if (level === "warn") console.warn(`[${area}] ${message}`, payload)
  else console.log(`[${area}] ${message}`, payload)

  await insertAppLog({ userId, level, area, message, meta: payload })
}

export async function logInfo(
  area: string,
  message: string,
  meta?: Record<string, unknown>,
  userId?: string | null,
  req?: NextRequest
) {
  return await log("info", area, message, meta, userId, req)
}

export async function logWarn(
  area: string,
  message: string,
  meta?: Record<string, unknown>,
  userId?: string | null,
  req?: NextRequest
) {
  return await log("warn", area, message, meta, userId, req)
}

export async function logError(
  area: string,
  message: string,
  meta?: Record<string, unknown>,
  userId?: string | null,
  req?: NextRequest
) {
  return await log("error", area, message, meta, userId, req)
}

