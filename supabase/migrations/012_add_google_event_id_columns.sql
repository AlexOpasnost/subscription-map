-- Add google event persistence columns for idempotent sync.
-- Required by API routes that write tasks/subscriptions google_event_id.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS google_event_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT NOT NULL DEFAULT 'primary';

CREATE INDEX IF NOT EXISTS tasks_user_id_google_event_id_idx
  ON public.tasks(user_id, google_event_id);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS google_event_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT NOT NULL DEFAULT 'primary';

CREATE INDEX IF NOT EXISTS subscriptions_user_id_google_event_id_idx
  ON public.subscriptions(user_id, google_event_id);

