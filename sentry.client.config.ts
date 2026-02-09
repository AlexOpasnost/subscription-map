import * as Sentry from "@sentry/nextjs"

const dsn = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim()

if (dsn) {
  Sentry.init({
    dsn,
    // Keep low/no overhead by default; tune later.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}

