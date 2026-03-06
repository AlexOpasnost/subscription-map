## Subscription Map

Next.js App Router + Supabase app for tracking subscriptions, plus an Assistant Inbox and internal notifications (in-app + email), with optional Notion integration.

## Getting started

```bash
npm install
npm run dev
```

## Supabase migrations

Run migrations from `supabase/migrations/` in order.

Internal notifications tables are added in:
- `supabase/migrations/013_notifications_pipeline.sql`

## Environment variables

### Required (client + server)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_URL` (absolute origin, e.g. `https://your-domain`)
- `NEXT_PUBLIC_APP_URL` (optional but recommended; same origin as `APP_URL`)

### Required (server only)

- `SUPABASE_URL` (used by server routes like `/api/assistant/execute`; typically same value as `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_ANON_KEY` (used by server routes like `/api/assistant/execute`; typically same value as `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` (needed for server-side inserts + notification runner)

### Notifications (email)

- `RESEND_API_KEY`
- `EMAIL_FROM` (e.g. `notify@yourdomain.com`)
- `NOTIFICATIONS_RUN_SECRET` (cron runner secret; `Authorization: Bearer <secret>`)

### Integrations (OAuth) (optional)

- `NOTION_CLIENT_ID`
- `NOTION_CLIENT_SECRET`

### AI Planner (server only)

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; default: `gpt-4.1-mini`)

### Sentry (optional)

- `SENTRY_DSN` (server)
- `NEXT_PUBLIC_SENTRY_DSN` (client)

Local dev:

- Create `.env.local` and set `OPENAI_API_KEY=...`

Vercel:

- Project → Settings → Environment Variables → add `OPENAI_API_KEY` (Production + Preview)

## OAuth redirect URLs

Notion is configured in-app (Settings → Integrations) via a token + database ID for this MVP (no OAuth redirect needed).

## Notifications runner (cron)

Send due notifications (in-app marks as sent; email uses Resend):

- While logged in, `POST /api/notifications/run` processes only the current user (cookie auth)
- Cron mode: `POST /api/notifications/run?cron_secret=...` (or rely on Vercel Cron header `x-vercel-cron: 1`)

