import { getAppUrl } from "@/lib/getAppUrl"

export function getSiteUrl(): string {
  // Backwards-compatible wrapper.
  return getAppUrl()
}

