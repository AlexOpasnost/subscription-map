export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export function getString(v: unknown): string {
  return typeof v === "string" ? v : ""
}

export function getObject(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {}
}

export function addDaysIsoDate(dateYyyyMmDd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYyyyMmDd.trim())
  if (!m) throw new Error(`Invalid YYYY-MM-DD date: ${dateYyyyMmDd}`)
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo, d))
  if (Number.isNaN(dt.getTime())) throw new Error(`Invalid date: ${dateYyyyMmDd}`)
  dt.setUTCDate(dt.getUTCDate() + days)
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

