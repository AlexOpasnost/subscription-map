# Notifications (MVP) setup

This app uses an internal notifications queue stored in Supabase (`public.notifications`), processed by a server endpoint.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFICATIONS_CRON_SECRET` (optional; required if you want to run the worker in cron mode via `?cron_secret=...`)

## Database migration

Apply the migration in `supabase/migrations/013_notifications_pipeline.sql` to create:

- `public.notifications`
- `public.user_notification_settings`

## Quick manual test (browser console)

Create a test notification (requires you to be logged in):

```js
fetch("/api/notifications/test", { method: "POST", credentials: "include" })
  .then((r) => r.json())
  .then(console.log)
```

Run the worker for the logged-in user:

```js
fetch("/api/notifications/run", { method: "POST", credentials: "include" })
  .then((r) => r.json())
  .then(console.log)
```

## Cron mode (process all users)

You can also run the worker globally (all users) by calling:

`POST /api/notifications/run?cron_secret=<NOTIFICATIONS_CRON_SECRET>`

If deployed on Vercel Cron, the request includes `x-vercel-cron: 1` and will be treated as cron mode.

