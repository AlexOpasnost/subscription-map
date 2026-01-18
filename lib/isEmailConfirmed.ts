export function isEmailConfirmed(user: unknown): boolean {
  if (!user || typeof user !== "object") return false
  const u = user as Record<string, unknown>

  const emailConfirmedAt = u["email_confirmed_at"]
  if (typeof emailConfirmedAt === "string" && emailConfirmedAt.trim()) return true

  // Some Supabase user shapes include `confirmed_at`.
  const confirmedAt = u["confirmed_at"]
  if (typeof confirmedAt === "string" && confirmedAt.trim()) return true

  return false
}

