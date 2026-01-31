/**
 * Convert a user-entered USD amount to integer cents.
 *
 * Accepts inputs like:
 * - "$14.99"
 * - "14.99"
 * - 14.99
 * - "14"
 * - 14
 *
 * Notes:
 * - This is intentionally simple (dot as decimal separator).
 * - Throws a user-safe error message on invalid values.
 */
export function toCents(input: string | number): number {
  const n =
    typeof input === "number"
      ? input
      : parseFloat(String(input).replace(/[^0-9.]/g, ""))

  const cents = Math.round(n * 100)
  if (!Number.isFinite(cents) || cents <= 0) throw new Error("Invalid price. Try: 14.99")
  return cents
}

