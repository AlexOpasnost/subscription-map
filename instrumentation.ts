import * as Sentry from "@sentry/nextjs"

export function register() {
  // Sentry reads config from sentry.*.config.ts
  // This hook gives us a safe spot to add tags if desired.
  const release = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12)
  if (release) {
    try {
      Sentry.setTag("release", release)
    } catch {
      // ignore
    }
  }
}

