-- Align personal secretary schema with product spec (non-breaking)
-- - reminders.remind_at should be nullable (offset/recurring can be computed)
-- - assistant_activity.input_text + intent should be NOT NULL per spec

-- 1) reminders: allow NULL remind_at
ALTER TABLE public.reminders
  ALTER COLUMN remind_at DROP NOT NULL;

-- Optional default for rule_type (keeps inserts sane when column omitted)
ALTER TABLE public.reminders
  ALTER COLUMN rule_type SET DEFAULT 'absolute';

-- 2) assistant_activity: enforce input_text + intent presence
UPDATE public.assistant_activity
SET input_text = COALESCE(NULLIF(input_text, ''), command)
WHERE input_text IS NULL OR input_text = '';

ALTER TABLE public.assistant_activity
  ALTER COLUMN input_text SET NOT NULL;

ALTER TABLE public.assistant_activity
  ALTER COLUMN intent SET DEFAULT '{}'::jsonb;

UPDATE public.assistant_activity
SET intent = '{}'::jsonb
WHERE intent IS NULL;

ALTER TABLE public.assistant_activity
  ALTER COLUMN intent SET NOT NULL;

