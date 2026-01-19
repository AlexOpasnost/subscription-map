import { format } from "date-fns"
import { enUS } from "date-fns/locale"

/**
 * Format a stored ISO date (YYYY-MM-DD) for consistent English UI display.
 *
 * Note: We intentionally keep native date inputs/calendar locale behavior unchanged.
 * This is only for formatting dates shown elsewhere in the UI.
 */
export function formatDisplayDate(isoDate: string | null | undefined): string | null {
  const s = (isoDate ?? "").trim()
  if (!s) return null

  // Stored form: YYYY-MM-DD (Supabase DATE)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null

  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])

  // Use local midnight so formatting never shifts the calendar day across timezones.
  const dt = new Date(y, mo, d)
  if (Number.isNaN(dt.getTime())) return null
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null

  return format(dt, "MMM d, yyyy", { locale: enUS })
}

