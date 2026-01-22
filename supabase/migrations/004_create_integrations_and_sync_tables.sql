-- Integrations + async sync pipeline tables
-- Works with Supabase RLS (auth.uid()) and server-side service role jobs.

-- 1) integrations: OAuth tokens + provider metadata
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'notion')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS integrations_user_id_provider_uidx
  ON public.integrations(user_id, provider);

CREATE INDEX IF NOT EXISTS integrations_user_id_idx
  ON public.integrations(user_id);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations"
  ON public.integrations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
  ON public.integrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON public.integrations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
  ON public.integrations
  FOR DELETE
  USING (auth.uid() = user_id);

-- 2) sync_jobs: async jobs queue for provider pushes
CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'notion')),
  action TEXT NOT NULL CHECK (action IN ('push_task', 'push_plan', 'push_subscription')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ok', 'error')),
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_jobs_status_created_at_idx
  ON public.sync_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS sync_jobs_user_id_created_at_idx
  ON public.sync_jobs(user_id, created_at DESC);

ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync jobs"
  ON public.sync_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync jobs"
  ON public.sync_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync jobs"
  ON public.sync_jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sync jobs"
  ON public.sync_jobs
  FOR DELETE
  USING (auth.uid() = user_id);

-- 3) sync_logs: per-job logs for debugging + transparency
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sync_job_id UUID NOT NULL REFERENCES public.sync_jobs(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_logs_sync_job_id_created_at_idx
  ON public.sync_logs(sync_job_id, created_at);

CREATE INDEX IF NOT EXISTS sync_logs_user_id_created_at_idx
  ON public.sync_logs(user_id, created_at DESC);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync logs"
  ON public.sync_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync logs"
  ON public.sync_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync logs"
  ON public.sync_logs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sync logs"
  ON public.sync_logs
  FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at trigger for sync_jobs
CREATE OR REPLACE FUNCTION public.set_sync_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_jobs_set_updated_at ON public.sync_jobs;
CREATE TRIGGER sync_jobs_set_updated_at
BEFORE UPDATE ON public.sync_jobs
FOR EACH ROW
EXECUTE PROCEDURE public.set_sync_jobs_updated_at();

-- Add meta JSONB to existing source-of-truth tables for external IDs.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

