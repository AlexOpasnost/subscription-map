function extractMessage(err: unknown): string {
  if (!err) return ""
  if (typeof err === "string") return err
  if (err instanceof Error) return err.message ?? ""
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === "string") return msg
  }
  return ""
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ")
}

export function humanizeError(err: unknown): string {
  // IMPORTANT: Never return raw provider/DB errors. Only return curated, user-safe messages.
  const raw = normalize(extractMessage(err))
  const msg = raw.toLowerCase()

  if (!msg) return "Something went wrong. Please try again."

  // Our own timeout helper throws a user-safe message.
  if (msg.includes("taking longer than expected")) return "This is taking longer than expected. Please try again."

  // Auth
  if (msg.includes("invalid login credentials")) return "Email or password is incorrect."
  if (msg.includes("email not confirmed") || msg.includes("confirm your email")) {
    return "Please confirm your email to continue."
  }
  if (msg.includes("user already registered") || msg.includes("already registered")) {
    return "An account with this email already exists. Try signing in instead."
  }
  if (msg.includes("password") && (msg.includes("at least") || msg.includes("too short"))) {
    return "Your password is too short. Use at least 8 characters."
  }
  if (msg.includes("expired") && msg.includes("link")) return "This link is invalid or expired. Please request a new one."

  // Network / connectivity
  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return "Network error. Check your connection and try again."
  }

  // Permissions / security / session
  if (msg.includes("jwt") || msg.includes("token") && msg.includes("expired")) {
    return "Your session expired. Please sign in again."
  }
  if (msg.includes("permission denied") || msg.includes("row level security") || msg.includes("rls")) {
    return "You don’t have access to do that."
  }

  // Database-ish errors (keep generic)
  if (msg.includes("duplicate key") || msg.includes("violates unique constraint")) {
    return "That already exists."
  }

  // Default
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

