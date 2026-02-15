import { NextResponse, type NextRequest } from "next/server"

import { getAppOrigin } from "@/lib/integrations/getAppOrigin"
import { signIntegrationState } from "@/lib/integrations/state"
import { requireServerEnv } from "@/lib/env"
import { supabaseServer } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const appOrigin = (() => {
      try {
        return getAppOrigin({ required: false })
      } catch {
        return req.nextUrl.origin
      }
    })()

    const redirectUri = `${appOrigin}/api/integrations/notion/callback`
    const clientId = requireServerEnv("NOTION_CLIENT_ID")

    const exp = Math.floor(Date.now() / 1000) + 10 * 60
    const state = signIntegrationState({ userId: user.id, provider: "notion", exp })

    const url = new URL("https://api.notion.com/v1/oauth/authorize")
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("owner", "user")
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("state", state)

    return NextResponse.json({ url: url.toString() })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json(
      {
        error: message,
        hint:
          "Check env vars: APP_URL (recommended), NEXT_PUBLIC_APP_URL (optional), NOTION_CLIENT_ID, NOTION_CLIENT_SECRET.",
      },
      { status: 500 }
    )
  }
}

