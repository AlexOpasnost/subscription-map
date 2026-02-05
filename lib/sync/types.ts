export type Provider = "google" | "notion"
export type TargetType = "task" | "subscription" | "person" | "reminder" | "plan"
export type SyncAction = "upsert" | "delete"
export type SyncJobStatus = "pending" | "ok" | "error"

export type SyncJobRow = {
  id: string
  user_id: string
  provider: Provider
  target_type: TargetType | string
  target_id: string
  action: SyncAction
  status: SyncJobStatus
  attempts: number
  last_error: string | null
  legacy_action?: string | null
  legacy_payload?: unknown
  legacy_status?: string | null
  created_at: string
  updated_at: string
}

export type IntegrationRow = {
  id: string
  user_id: string
  provider: Provider
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  scope?: string | null
  meta: unknown
  metadata?: unknown
  created_at: string
}

