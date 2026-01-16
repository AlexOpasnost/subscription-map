export function humanizeError(err: unknown): string {
  if (!err) return "Something went wrong. Please try again."
  if (typeof err === "string") return err
  if (err instanceof Error) return err.message || "Something went wrong. Please try again."

  // Supabase/PostgREST style errors often have a `message` string.
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as any).message
    if (typeof msg === "string" && msg.trim()) return msg
  }

  return "Something went wrong. Please try again."
}

export async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms = 15000,
  timeoutMessage = "This is taking longer than expected. Please try again."
): Promise<T> {
  let timeoutId: number | undefined

  const timeout = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), ms)
  })

  try {
    return await Promise.race([Promise.resolve(promise), timeout])
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId)
  }
}

