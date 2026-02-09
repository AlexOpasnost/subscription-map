-- Production hardening: observability tables + schema alignment (additive).
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- Ensure uuid generator is available.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) subscriptions: add fields requested by spec (non-breaking)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS service_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS plan_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS price NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS currency TEXT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS region TEXT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NULL;

-- Backfill best-effort.
UPDATE public.subscriptions
SET
  price = COALESCE(price, (price_cents::numeric / 100.0)),
  status = COALESCE(status, CASE WHEN cancelled THEN 'cancelled' ELSE 'active' END),
  currency = COALESCE(NULLIF(currency, ''), 'USD')
WHERE price IS NULL OR status IS NULL OR currency IS NULL OR currency = '';

CREATE INDEX IF NOT EXISTS subscriptions_user_id_status_idx
  ON public.subscriptions(user_id, status);

-- 2) integrations: align columns to spec (additive, keep existing columns)
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB NULL;

-- Ensure RLS is on and policies exist for integrations (explicit, safe defaults).
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own integrations" ON public.integrations;
CREATE POLICY "Users can view own integrations"
  ON public.integrations
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own integrations" ON public.integrations;
CREATE POLICY "Users can insert own integrations"
  ON public.integrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own integrations" ON public.integrations;
CREATE POLICY "Users can update own integrations"
  ON public.integrations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own integrations" ON public.integrations;
CREATE POLICY "Users can delete own integrations"
  ON public.integrations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Best-effort backfill scopes from `scope` (space-separated) into `scopes`.
UPDATE public.integrations
SET scopes = CASE
  WHEN scopes IS NOT NULL THEN scopes
  WHEN scope IS NULL OR scope = '' THEN NULL
  ELSE regexp_split_to_array(scope, '\s+')
END
WHERE scopes IS NULL;

-- 3) ai_usage: per-request token usage and cost
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NULL,
  output_tokens INTEGER NULL,
  total_tokens INTEGER NULL,
  cost_usd NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_id_created_at_idx
  ON public.ai_usage(user_id, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai usage" ON public.ai_usage;
CREATE POLICY "Users can view own ai usage"
  ON public.ai_usage
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ai usage" ON public.ai_usage;
CREATE POLICY "Users can insert own ai usage"
  ON public.ai_usage
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own ai usage" ON public.ai_usage;
CREATE POLICY "Users can delete own ai usage"
  ON public.ai_usage
  FOR DELETE
  USING (auth.uid() = user_id);

-- 4) app_logs: unified server-side log sink
CREATE TABLE IF NOT EXISTS public.app_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  level TEXT NOT NULL,
  area TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_logs_created_at_idx
  ON public.app_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS app_logs_user_id_created_at_idx
  ON public.app_logs(user_id, created_at DESC);

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

-- Users can only read their own logs (or none if user_id is NULL).
DROP POLICY IF EXISTS "Users can view own app logs" ON public.app_logs;
CREATE POLICY "Users can view own app logs"
  ON public.app_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to insert their own logs (server-side logging can use service role to bypass RLS).
DROP POLICY IF EXISTS "Users can insert own app logs" ON public.app_logs;
CREATE POLICY "Users can insert own app logs"
  ON public.app_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

