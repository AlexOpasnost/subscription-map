import type { SupabaseClient } from "@supabase/supabase-js"

import type { Provider, SyncAction } from "@/lib/sync/types"

export async function enqueueSyncJobs(
  supabase: SupabaseClient,
  input: { userId: string; action: SyncAction; payload: Record<string, unknown> }
): Promise<{ enqueued: number }> {
  const { data: integrations, error: integrationsError } = await supabase
    .from("integrations")
    .select("provider")

  if (integrationsError) {
    // Enqueue is best-effort and should never break the user flow.
    return { enqueued: 0 }
  }

  const providers = (integrations ?? [])
    .map((r) => (typeof (r as { provider?: unknown }).provider === "string" ? (r as { provider: string }).provider : ""))
    .filter((p): p is Provider => p === "google" || p === "notion")

  if (providers.length === 0) return { enqueued: 0 }

  const jobs = providers.map((provider) => ({
    user_id: input.userId,
    provider,
    action: input.action,
    payload: input.payload,
    status: "queued" as const,
  }))

  const { error: insertError } = await supabase.from("sync_jobs").insert(jobs)
  if (insertError) return { enqueued: 0 }

  return { enqueued: jobs.length }
}

