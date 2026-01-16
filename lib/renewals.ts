export function parseYyyyMmDd(dateStr: string): Date | null {
  // Supabase DATE comes back as "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo, d))
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

export function daysUntilYyyyMmDd(dateStr: string, now = new Date()): number | null {
  const target = parseYyyyMmDd(dateStr)
  if (!target) return null

  // Compare at day resolution in UTC to avoid tz off-by-ones.
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
  return Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24))
}

export function formatRenewalCountdown(daysUntil: number): string {
  if (daysUntil === 0) return "Renews today"
  if (daysUntil === 1) return "Renews in 1 day"
  return `Renews in ${daysUntil} days`
}

