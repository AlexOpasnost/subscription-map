"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type ToastVariant = "default" | "success" | "error"

type Toast = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

type ToastInput = Omit<Toast, "id"> & {
  durationMs?: number
}

type ToastContextValue = {
  toast: (t: ToastInput) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

function getToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within <ToastProvider />")
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const timersRef = React.useRef<Map<string, number>>(new Map())

  const dismiss = React.useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) window.clearTimeout(timer)
    timersRef.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    ({ durationMs = 4000, ...t }: ToastInput) => {
      const id = getToastId()
      setToasts((prev) => [...prev, { id, ...t }])
      const timer = window.setTimeout(() => dismiss(id), durationMs)
      timersRef.current.set(id, timer)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="fixed right-4 top-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "rounded-lg border bg-background shadow-lg px-4 py-3",
              t.variant === "success" && "border-emerald-200 bg-emerald-50/70 text-emerald-950",
              t.variant === "error" && "border-destructive/30 bg-destructive/10 text-destructive"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">{t.title}</div>
                {t.description && (
                  <div className="mt-1 text-sm text-muted-foreground">{t.description}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md px-2 py-1 text-sm hover:bg-black/5 active:bg-black/10"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

