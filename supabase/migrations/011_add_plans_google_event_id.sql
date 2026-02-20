-- Add google_event_id to plans for idempotent Google Calendar sync.
-- Additive + safe for re-runs.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS google_event_id TEXT NULL;

CREATE INDEX IF NOT EXISTS plans_user_id_google_event_id_idx
  ON public.plans(user_id, google_event_id);

