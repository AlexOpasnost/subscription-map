const SIGNED_IN_TOAST_KEY = "subscription-map:signed-in-toast"

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

