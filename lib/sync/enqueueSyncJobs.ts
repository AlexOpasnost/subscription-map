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
    .select("provider,status,meta,metadata")
    .eq("user_id", input.userId)

  if (integrationsError) {
    // Enqueue is best-effort and should never break the user flow.
    return { enqueued: 0 }
  }

  const providers = (integrations ?? [])
    .map((r) => ({
      provider: typeof (r as { provider?: unknown }).provider === "string" ? ((r as { provider: string }).provider as string) : "",
      status: typeof (r as { status?: unknown }).status === "string" ? String((r as { status: string }).status) : "",
      meta: (r as { meta?: unknown }).meta,
      metadata: (r as { metadata?: unknown }).metadata,
    }))
    .filter((r) => r.provider === "google" || r.provider === "notion")
    .filter((r) => {
      if (r.status && r.status.toLowerCase() === "disconnected") return false
      return true
    })
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

  let insertedRows: unknown = null
  let insertError: { message?: string } | null = null
  {
    const res = await supabase.from("sync_jobs").insert(jobs).select("id")
    insertedRows = res.data
    insertError = (res.error as { message?: string } | null) ?? null
  }

  // Fallback for older sync_jobs schemas (no target_type/target_id/etc).
  if (insertError) {
    const msg = typeof insertError.message === "string" ? insertError.message.toLowerCase() : ""
    if (msg.includes("column") && (msg.includes("target_type") || msg.includes("attempts") || msg.includes("legacy_action"))) {
      const legacyJobs = selectedProviders.map((p) => ({
        user_id: input.userId,
        provider: p.provider,
        action: legacyAction,
        payload: { record_id: input.targetId },
        status: "queued" as const,
        error: null,
      }))
      const res = await supabase.from("sync_jobs").insert(legacyJobs).select("id")
      insertedRows = res.data
      insertError = (res.error as { message?: string } | null) ?? null
    }
  }

  if (insertError) return { enqueued: 0 }

  const jobIds = Array.isArray(insertedRows) ? insertedRows.map((r: any) => String(r.id)).filter(Boolean) : []

  // Best-effort activity log (never blocks enqueue).
  try {
    await supabase.from("assistant_activity").insert({
      user_id: input.userId,
      kind: "job_created",
      command: `sync job created: ${selectedProviders.map((p) => p.provider).join(",")}`,
      result: { providers: selectedProviders.map((p) => p.provider), target_type: input.targetType, target_id: input.targetId, jobIds },
      input_text: `sync job created: ${input.targetType}`,
      intent: {},
      status: "ok",
      error: null,
    })
  } catch {
    // ignore
  }

  return { enqueued: selectedProviders.length, jobIds }
}

