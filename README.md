## Subscription Map

Next.js App Router + Supabase app for tracking subscriptions, plus an Assistant Inbox and async integrations (Google Calendar + Notion).

## Getting started

```bash
npm install
npm run dev
```

## Supabase migrations

Run migrations from `supabase/migrations/` in order.

The integrations + async sync tables are added in:
- `supabase/migrations/004_create_integrations_and_sync_tables.sql`

## Environment variables

### Required (client + server)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_URL` (absolute origin, e.g. `https://your-domain`)

### Required (server only)

- `SUPABASE_SERVICE_ROLE_KEY` (needed for OAuth callbacks and cron-based sync runner)

### Integrations (OAuth)

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NOTION_CLIENT_ID`
- `NOTION_CLIENT_SECRET`

### Optional (recommended)

- `SYNC_RUN_SECRET` (if set, `/api/sync/run` requires `Authorization: Bearer <SYNC_RUN_SECRET>`)

## OAuth redirect URLs

Configure the following redirect URIs in each provider dashboard (built from `APP_URL`):

- **Google**: `${APP_URL}/api/integrations/google/callback`
- **Notion**: `${APP_URL}/api/integrations/notion/callback`

## Sync runner (Vercel Cron suggestion)

Syncing is async: user actions enqueue rows into `sync_jobs`. A server route processes queued jobs in small batches (limit 10 per run):

- `POST /api/sync/run` (or `GET /api/sync/run`)

Suggested Vercel Cron schedule: every 5 minutes call `/api/sync/run` with:

- `Authorization: Bearer ${SYNC_RUN_SECRET}` (recommended)

