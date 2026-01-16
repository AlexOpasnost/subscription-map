export function getSiteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const base =
    env && env.length > 0
      ? env
      : typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000"
  return base.replace(/\/+$/, "")
}

