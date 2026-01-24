-- OAuth tokens (Google/Notion) + assistant activity log
-- Additive migration: does NOT remove existing tables.

-- 1) oauth_tokens: stores provider OAuth tokens per user
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'notion')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  scope TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_tokens_user_id_provider_uidx
  ON public.oauth_tokens(user_id, provider);

CREATE INDEX IF NOT EXISTS oauth_tokens_user_id_idx
  ON public.oauth_tokens(user_id);

ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own oauth tokens"
  ON public.oauth_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own oauth tokens"
  ON public.oauth_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own oauth tokens"
  ON public.oauth_tokens
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own oauth tokens"
  ON public.oauth_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at trigger (reuse pattern)
CREATE OR REPLACE FUNCTION public.set_oauth_tokens_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oauth_tokens_set_updated_at ON public.oauth_tokens;
CREATE TRIGGER oauth_tokens_set_updated_at
BEFORE UPDATE ON public.oauth_tokens
FOR EACH ROW
EXECUTE PROCEDURE public.set_oauth_tokens_updated_at();

-- 2) assistant_activity: simple auditable log of assistant command executions
CREATE TABLE IF NOT EXISTS public.assistant_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  command TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assistant_activity_user_id_created_at_idx
  ON public.assistant_activity(user_id, created_at DESC);

ALTER TABLE public.assistant_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assistant activity"
  ON public.assistant_activity
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assistant activity"
  ON public.assistant_activity
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own assistant activity"
  ON public.assistant_activity
  FOR DELETE
  USING (auth.uid() = user_id);

-- 3) Add requested date columns to existing tables (if they exist)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_date DATE NULL;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS target_date DATE NULL;

