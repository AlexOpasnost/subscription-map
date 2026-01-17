export function getRedirectUrl(): string {
  // Client-only helper for OAuth redirects (works on localhost + Vercel, including mobile).
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`
  }
  return "/auth/callback"
}

