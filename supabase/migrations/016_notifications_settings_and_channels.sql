-- Align notifications + settings to current minimal schema.
-- Safe additive migration.

-- notifications: ensure required columns exist
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  run_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Relax/normalize allowed values (no hard CHECK constraints here to avoid breaking prod unexpectedly).
CREATE INDEX IF NOT EXISTS notifications_user_id_status_run_at_idx
  ON public.notifications(user_id, status, run_at);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- users can read their own notifications; server/service role does writes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='Users can view own notifications'
  ) THEN
    CREATE POLICY "Users can view own notifications"
      ON public.notifications
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- user_notification_settings: align to new preference schema
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_address TEXT NULL,
  telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_chat_id TEXT NULL,
  inapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start TEXT NULL,
  quiet_hours_end TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS email_address TEXT NULL;
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT NULL;
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS inapp_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS quiet_hours_start TEXT NULL;
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS quiet_hours_end TEXT NULL;

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_settings' AND policyname='Users can view own notification settings'
  ) THEN
    CREATE POLICY "Users can view own notification settings"
      ON public.user_notification_settings
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_settings' AND policyname='Users can insert own notification settings'
  ) THEN
    CREATE POLICY "Users can insert own notification settings"
      ON public.user_notification_settings
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_settings' AND policyname='Users can update own notification settings'
  ) THEN
    CREATE POLICY "Users can update own notification settings"
      ON public.user_notification_settings
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- updated_at triggers (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_set_updated_at ON public.notifications;
CREATE TRIGGER notifications_set_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS user_notification_settings_set_updated_at ON public.user_notification_settings;
CREATE TRIGGER user_notification_settings_set_updated_at
BEFORE UPDATE ON public.user_notification_settings
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

