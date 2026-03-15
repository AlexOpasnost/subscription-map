-- Add lead-time preference for internal notifications.
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS default_lead_minutes INTEGER NOT NULL DEFAULT 1440;

