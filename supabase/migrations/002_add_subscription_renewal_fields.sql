-- Add renewal/reminder helper fields to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS renewal_date DATE;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS reminder_days INTEGER NOT NULL DEFAULT 3;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS notes TEXT;

