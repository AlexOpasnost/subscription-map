function normalizeAbsoluteUrl(input: string): string {
  const raw = input.trim().replace(/\/+$/, "")
  if (!raw) return ""
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  return `https://${raw}`
}

export function getAppOrigin(): string {
  const fromEnv = normalizeAbsoluteUrl(process.env.APP_URL ?? "")
  if (!fromEnv) {
    throw new Error("Missing environment variable: APP_URL (e.g. https://your-domain)")
  }
  return fromEnv
}

