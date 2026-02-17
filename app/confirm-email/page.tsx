import { redirect } from "next/navigation"

// Back-compat route: the app now uses `/check-email`.
type SearchParams = Record<string, string | string[] | undefined>

export default async function ConfirmEmailRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (typeof v === "string" && v.length > 0) qs.set(k, v)
    else if (Array.isArray(v)) v.forEach((x) => (typeof x === "string" ? qs.append(k, x) : null))
  }

  const suffix = qs.toString()
  redirect(suffix ? `/check-email?${suffix}` : "/check-email")
}

