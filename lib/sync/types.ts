export type Provider = "google" | "notion"
export type SyncAction = "push_task" | "push_plan" | "push_subscription"
export type SyncJobStatus = "queued" | "running" | "ok" | "error"

export type SyncJobRow = {
  id: string
  user_id: string
  provider: Provider
  action: SyncAction
  payload: unknown
  status: SyncJobStatus
  error: string | null
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
  meta: unknown
  created_at: string
}

