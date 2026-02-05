-- Integrations v2: external_links + sync_jobs alignment + safe metadata columns
-- Goals:
-- - Add `external_links` for mapping internal records to provider IDs
-- - Align `sync_jobs` to the app's production sync pipeline spec (attempts, last_error, action/status/target fields)
-- - Keep changes additive/back-compatible where possible

-- 1) integrations: add `scope` + `metadata` (keep existing `meta`)
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS scope TEXT NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB NULL;

-- 2) external_links: provider external id mapping per record
CREATE TABLE IF NOT EXISTS public.external_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, -- 'task'|'subscription'|'person'|'reminder' (plus any future types)
  target_id UUID NOT NULL,
  provider TEXT NOT NULL, -- 'google'|'notion'
  external_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS external_links_user_provider_target_uidx
  ON public.external_links(user_id, provider, target_type, target_id);

CREATE INDEX IF NOT EXISTS external_links_user_provider_created_at_idx
  ON public.external_links(user_id, provider, created_at DESC);

ALTER TABLE public.external_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own external links"
  ON public.external_links
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own external links"
  ON public.external_links
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own external links"
  ON public.external_links
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own external links"
  ON public.external_links
  FOR DELETE
  USING (auth.uid() = user_id);

-- 3) sync_jobs: align schema to spec
-- Existing (migration 004):
-- - provider in ('google','notion')
-- - action in ('push_task','push_plan','push_subscription')
-- - payload jsonb
-- - status in ('queued','running','ok','error')
-- - error text
--
-- New spec:
-- - provider text
-- - target_type text
-- - target_id uuid
-- - action in ('upsert','delete')
-- - status in ('pending','ok','error')
-- - attempts int default 0
-- - last_error text null
-- - created_at/updated_at

-- Drop legacy checks so we can rename/add columns safely.
ALTER TABLE public.sync_jobs DROP CONSTRAINT IF EXISTS sync_jobs_action_check;
ALTER TABLE public.sync_jobs DROP CONSTRAINT IF EXISTS sync_jobs_status_check;

-- Rename legacy columns (keep the data for debugging/backfill).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_jobs' AND column_name = 'action'
  ) THEN
    ALTER TABLE public.sync_jobs RENAME COLUMN action TO legacy_action;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_jobs' AND column_name = 'payload'
  ) THEN
    ALTER TABLE public.sync_jobs RENAME COLUMN payload TO legacy_payload;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_jobs' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.sync_jobs RENAME COLUMN status TO legacy_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_jobs' AND column_name = 'error'
  ) THEN
    ALTER TABLE public.sync_jobs RENAME COLUMN error TO last_error;
  END IF;
END
$$;

-- Add new columns (v2).
ALTER TABLE public.sync_jobs
  ADD COLUMN IF NOT EXISTS target_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS target_id UUID NULL,
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'upsert',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- Backfill v2 fields from legacy payloads (best-effort).
UPDATE public.sync_jobs
SET
  target_type = COALESCE(
    target_type,
    CASE legacy_action
      WHEN 'push_task' THEN 'task'
      WHEN 'push_subscription' THEN 'subscription'
      WHEN 'push_plan' THEN 'plan'
      ELSE NULL
    END
  ),
  target_id = COALESCE(
    target_id,
    CASE
      WHEN (legacy_payload->>'record_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (legacy_payload->>'record_id')::uuid
      ELSE NULL
    END
  ),
  status = COALESCE(
    NULLIF(status, ''),
    CASE legacy_status
      WHEN 'ok' THEN 'ok'
      WHEN 'error' THEN 'error'
      ELSE 'pending'
    END
  )
WHERE true;

-- Add constraints for v2 columns.
ALTER TABLE public.sync_jobs
  ADD CONSTRAINT sync_jobs_action_v2_check CHECK (action IN ('upsert', 'delete'));

ALTER TABLE public.sync_jobs
  ADD CONSTRAINT sync_jobs_status_v2_check CHECK (status IN ('pending', 'ok', 'error'));

