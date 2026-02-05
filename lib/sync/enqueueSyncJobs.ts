import type { SupabaseClient } from "@supabase/supabase-js"

import type { Provider, SyncAction, TargetType } from "@/lib/sync/types"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function getSyncSettings(meta: unknown): { tasks: boolean; subscriptions: boolean; birthdays: boolean } {
  const m = isRecord(meta) ? meta : {}
  const sync = isRecord(m.sync) ? (m.sync as Record<string, unknown>) : {}
  const tasks = typeof sync.tasks === "boolean" ? sync.tasks : true
  const subscriptions = typeof sync.subscriptions === "boolean" ? sync.subscriptions : true
  const birthdays = typeof sync.birthdays === "boolean" ? sync.birthdays : true
  return { tasks, subscriptions, birthdays }
}

function shouldSyncTarget(targetType: TargetType, settings: { tasks: boolean; subscriptions: boolean; birthdays: boolean }): boolean {
  if (targetType === "task") return settings.tasks
  if (targetType === "subscription") return settings.subscriptions
  if (targetType === "person") return settings.birthdays
  // Reminders and other types default to true for now.
  return true
}

export async function enqueueSyncJobs(
  supabase: SupabaseClient,
  input: { userId: string; provider?: Provider; action: SyncAction; targetType: TargetType; targetId: string }
): Promise<{ enqueued: number; jobIds?: string[] }> {
  const { data: integrations, error: integrationsError } = await supabase
    .from("integrations")
    .select("provider,meta,metadata")

  if (integrationsError) {
    // Enqueue is best-effort and should never break the user flow.
    return { enqueued: 0 }
  }

  const providers = (integrations ?? [])
    .map((r) => ({
      provider: typeof (r as { provider?: unknown }).provider === "string" ? ((r as { provider: string }).provider as string) : "",
      meta: (r as { meta?: unknown }).meta,
      metadata: (r as { metadata?: unknown }).metadata,
    }))
    .filter((r) => r.provider === "google" || r.provider === "notion")
    .map((r) => {
      const merged = isRecord(r.meta) ? r.meta : isRecord(r.metadata) ? r.metadata : {}
      const settings = getSyncSettings(merged)
      return { provider: r.provider as Provider, settings }
    })
    .filter((r) => shouldSyncTarget(input.targetType, r.settings))

  const selectedProviders = input.provider ? providers.filter((p) => p.provider === input.provider) : providers
  if (selectedProviders.length === 0) return { enqueued: 0 }

  const legacyAction =
    input.targetType === "task"
      ? "push_task"
      : input.targetType === "subscription"
        ? "push_subscription"
        : input.targetType === "plan"
          ? "push_plan"
          : input.targetType === "person"
            ? "push_person"
            : input.targetType === "reminder"
              ? "push_reminder"
              : "push_unknown"

  const jobs = selectedProviders.map((p) => ({
    user_id: input.userId,
    provider: p.provider,
    target_type: input.targetType,
    target_id: input.targetId,
    action: input.action,
    status: "pending" as const,
    attempts: 0,
    last_error: null,
    // For backward compatibility and safe claiming in the worker.
    legacy_action: legacyAction,
    legacy_payload: { record_id: input.targetId },
    legacy_status: "queued",
  }))

  const { data: inserted, error: insertError } = await supabase.from("sync_jobs").insert(jobs).select("id")
  if (insertError) return { enqueued: 0 }

  const jobIds = Array.isArray(inserted) ? inserted.map((r: any) => String(r.id)).filter(Boolean) : []
  return { enqueued: jobs.length, jobIds }
}

