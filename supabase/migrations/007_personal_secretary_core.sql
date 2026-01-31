-- Personal secretary core tables (additive migration)
-- Goals:
-- - Keep existing app working (non-breaking)
-- - Add missing columns to match product spec
-- - Add new `people` table for birthdays
-- - Ensure RLS policies exist and match auth.uid() = user_id

-- 1) tasks: add category/amount/currency fields (keep existing columns: due_at, due_date, notes, meta)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER NULL,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

-- (Optional) status is already TEXT with default 'open' from 003 migration.
-- We intentionally avoid adding a CHECK constraint here to prevent breaking existing deployments.

CREATE INDEX IF NOT EXISTS tasks_user_id_due_at_idx
  ON public.tasks(user_id, due_at);

CREATE INDEX IF NOT EXISTS tasks_user_id_due_date_idx
  ON public.tasks(user_id, due_date);

-- 2) people: birthdays / contacts
CREATE TABLE IF NOT EXISTS public.people (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_date DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS people_user_id_created_at_idx
  ON public.people(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS people_user_id_birth_date_idx
  ON public.people(user_id, birth_date);

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own people"
  ON public.people
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own people"
  ON public.people
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own people"
  ON public.people
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own people"
  ON public.people
  FOR DELETE
  USING (auth.uid() = user_id);

-- 3) reminders: upgrade existing table created in 003 to match spec
-- Existing schema (003): kind, target_type, target_id, remind_at (NOT NULL), created_at
-- New spec: title, rule_type, offset_days, anchor_field, rrule, channel
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS title TEXT NULL,
  ADD COLUMN IF NOT EXISTS rule_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS offset_days INTEGER NULL,
  ADD COLUMN IF NOT EXISTS anchor_field TEXT NULL,
  ADD COLUMN IF NOT EXISTS rrule TEXT NULL,
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'in_app';

-- Backfill title/rule_type for existing rows so we can enforce NOT NULL safely.
UPDATE public.reminders
SET
  title = COALESCE(NULLIF(title, ''), NULLIF(kind, ''), 'Reminder'),
  rule_type = COALESCE(NULLIF(rule_type, ''), 'absolute')
WHERE title IS NULL OR title = '' OR rule_type IS NULL OR rule_type = '';

ALTER TABLE public.reminders
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN rule_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS reminders_user_id_target_type_target_id_idx
  ON public.reminders(user_id, target_type, target_id);

-- 4) assistant_activity: extend existing audit log table (created in 005) to match spec
-- Existing schema (005): kind, command, result
-- New spec: input_text, intent, status, error
ALTER TABLE public.assistant_activity
  ADD COLUMN IF NOT EXISTS input_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS intent JSONB NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS error TEXT NULL;

-- Backfill input_text for older rows (keep best-effort).
UPDATE public.assistant_activity
SET input_text = COALESCE(NULLIF(input_text, ''), command)
WHERE input_text IS NULL OR input_text = '';

CREATE INDEX IF NOT EXISTS assistant_activity_user_id_created_at_status_idx
  ON public.assistant_activity(user_id, created_at DESC, status);

