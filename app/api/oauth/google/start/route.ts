import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ ok: false, error: "GOOGLE_INTEGRATION_REMOVED" }, { status: 410 })
}

