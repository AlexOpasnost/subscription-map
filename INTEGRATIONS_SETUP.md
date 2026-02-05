# Integrations setup (Google Calendar + Notion)

This app can sync **Tasks**, **Subscription renewal reminders**, and **Birthdays** to:

- Google Calendar (events)
- Notion (database rows / pages)

Sync is **async + retryable** via `sync_jobs`, and you can manually trigger a run from **Settings → Integrations → Retry sync**.

## Environment variables

Set these on Vercel (and in `.env.local` for local dev):

### Required (Supabase)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; used for secure OAuth state signing and the sync runner)

### Required (Google Calendar OAuth)

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APP_URL`
  - Local: `http://localhost:3000`
  - Production: your deployed domain (e.g. `https://your-app.vercel.app`)

### Optional (Sync runner protection)

- `SYNC_RUN_SECRET`
  - If set, `/api/sync/run` can be executed in **cron mode** when `Authorization: Bearer $SYNC_RUN_SECRET`.
  - Without it, authenticated users can still run sync **for their own jobs** from the UI.

## Google Calendar: create OAuth Client ID

1. Open Google Cloud Console and create/select a project.
2. Configure **OAuth consent screen** (External is fine for dev).
3. Create **OAuth Client ID** (Web application).
4. Add **Authorized redirect URI**:

`$APP_URL/api/integrations/google/callback`

5. Copy the Client ID/Secret into:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The app requests scope:

- `https://www.googleapis.com/auth/calendar.events`

## Notion: connect via token + database

This MVP uses **manual Notion token setup**:

1. Create a Notion integration at Notion Developers.
2. Copy the integration token.
3. Share your target database with the integration (Database → “…” → Add connections).
4. In the app, go to **Settings → Integrations → Notion** and paste:
   - **Token**
   - **Database ID**

Notes:

- The token is saved **server-side** (in `integrations.access_token`) and is **never returned** to the browser after saving.
- The database ID is stored in integration metadata.

### Recommended Notion database properties

The sync works best if your database includes these properties (names are case-insensitive; the app will auto-detect common names):

- **Title** (type: `title`) – required by Notion
- **Type** (type: `select` preferred; `multi_select`/`rich_text` also supported)
- **Date** (type: `date`)
- **Amount** (type: `number`)
- **Status** (type: `status` preferred; `select`/`rich_text` also supported)

If these properties don’t exist, the app will still create pages with just the Title.

## How sync works (high level)

1. Creating/updating records enqueues `sync_jobs` (per provider).
2. `/api/sync/run` processes up to 10 pending jobs:
   - Refreshes Google access tokens when needed
   - Upserts Google Calendar events / Notion pages
   - Stores mappings in `external_links`

## Troubleshooting

- **Google says “redirect_uri_mismatch”**: confirm the redirect URI matches exactly:
  - `$APP_URL/api/integrations/google/callback`
- **Notion “object not found”**: ensure the database is shared with the integration.
- **Nothing syncs**: check Settings → Integrations toggles and click **Retry sync**.

