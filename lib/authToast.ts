const SIGNED_IN_TOAST_KEY = "subscription-map:signed-in-toast"
const QUEUED_TOAST_KEY = "subscription-map:queued-toast"

export type QueuedToast = {
  title: string
  description?: string
  variant?: "default" | "success" | "error"
}

export function markSignedInToast() {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(SIGNED_IN_TOAST_KEY, "1")
}

export function consumeSignedInToast(): boolean {
  if (typeof window === "undefined") return false
  const v = window.sessionStorage.getItem(SIGNED_IN_TOAST_KEY)
  if (!v) return false
  window.sessionStorage.removeItem(SIGNED_IN_TOAST_KEY)
  return true
}

export function queueToast(t: QueuedToast) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(QUEUED_TOAST_KEY, JSON.stringify(t))
  } catch {
    // ignore
  }
}

export function consumeQueuedToast(): QueuedToast | null {
  if (typeof window === "undefined") return null
  const raw = window.sessionStorage.getItem(QUEUED_TOAST_KEY)
  if (!raw) return null
  window.sessionStorage.removeItem(QUEUED_TOAST_KEY)
  try {
    const parsed = JSON.parse(raw) as QueuedToast
    if (!parsed || typeof parsed.title !== "string" || !parsed.title.trim()) return null
    return parsed
  } catch {
    return null
  }
}
