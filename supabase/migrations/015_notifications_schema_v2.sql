-- Notifications schema v2 (matches current product direction).
-- Safe to run after older notifications migrations (013/014) if they exist.

-- 1) user_notification_settings
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NULL,
  telegram_chat_id TEXT NULL,
  preferred_channel TEXT NOT NULL DEFAULT 'email',
  tz TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS email TEXT NULL;
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT NULL;
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS preferred_channel TEXT NOT NULL DEFAULT 'email';
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS tz TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill from older column names if present.
UPDATE public.user_notification_settings
SET tz = COALESCE(NULLIF(tz, ''), NULLIF(timezone, ''), 'UTC')
WHERE (tz IS NULL OR tz = '') AND (timezone IS NOT NULL);

ALTER TABLE public.user_notification_settings
  DROP CONSTRAINT IF EXISTS user_notification_settings_preferred_channel_check;
ALTER TABLE public.user_notification_settings
  ADD CONSTRAINT user_notification_settings_preferred_channel_check
  CHECK (preferred_channel IN ('email','telegram','in_app'));

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

-- updated_at trigger (shared)
CREATE OR REPLACE FUNCTION public.set_updated_at()
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
EXECUTE PROCEDURE public.set_updated_at();

-- 2) notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  source_type TEXT NOT NULL DEFAULT 'task',
  source_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'in_app';
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NULL;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'task';
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_id UUID NULL;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure body is NOT NULL (older migrations had it nullable).
UPDATE public.notifications
SET body = COALESCE(body, '')
WHERE body IS NULL;
ALTER TABLE public.notifications
  ALTER COLUMN body SET NOT NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_channel_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_channel_check CHECK (channel IN ('email','telegram','in_app'));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_status_check CHECK (status IN ('pending','processing','sent','error'));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_source_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_source_type_check CHECK (source_type IN ('task','subscription','manual'));

CREATE INDEX IF NOT EXISTS notifications_user_id_status_run_at_idx
  ON public.notifications(user_id, status, run_at);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications; inserts/updates are server-only (service role bypasses RLS).
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

DROP TRIGGER IF EXISTS notifications_set_updated_at ON public.notifications;
CREATE TRIGGER notifications_set_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

-- 3) Optional: notification_logs
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NULL REFERENCES public.notifications(id) ON DELETE SET NULL,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_logs_notification_id_created_at_idx
  ON public.notification_logs(notification_id, created_at DESC);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notification_logs' AND policyname='Users can view own notification logs'
  ) THEN
    CREATE POLICY "Users can view own notification logs"
      ON public.notification_logs
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

