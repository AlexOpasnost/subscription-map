-- Internal notifications pipeline (MVP).
-- Additive + safe for re-runs.

-- 1) public.notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('inapp','email','telegram')),
  title TEXT NOT NULL,
  body TEXT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_run_at_idx
  ON public.notifications(user_id, run_at);

CREATE INDEX IF NOT EXISTS notifications_status_run_at_idx
  ON public.notifications(status, run_at);

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read/insert/update their own notifications.
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='Users can insert own notifications'
  ) THEN
    CREATE POLICY "Users can insert own notifications"
      ON public.notifications
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='Users can update own notifications'
  ) THEN
    CREATE POLICY "Users can update own notifications"
      ON public.notifications
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 2) public.user_notification_settings
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NULL,
  telegram_chat_id TEXT NULL,
  telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  inapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timezone TEXT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- updated_at trigger for user_notification_settings
CREATE OR REPLACE FUNCTION public.set_user_notification_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_notification_settings_set_updated_at ON public.user_notification_settings;
CREATE TRIGGER user_notification_settings_set_updated_at
BEFORE UPDATE ON public.user_notification_settings
FOR EACH ROW
EXECUTE PROCEDURE public.set_user_notification_settings_updated_at();

