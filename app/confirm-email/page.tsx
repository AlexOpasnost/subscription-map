import { redirect } from "next/navigation"

// Back-compat route: the app now uses `/check-email`.
export default function ConfirmEmailRedirectPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === "string" && v.length > 0) qs.set(k, v)
    else if (Array.isArray(v)) v.forEach((x) => (typeof x === "string" ? qs.append(k, x) : null))
  }

  const suffix = qs.toString()
  redirect(suffix ? `/check-email?${suffix}` : "/check-email")
}

