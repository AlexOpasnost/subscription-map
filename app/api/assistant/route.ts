import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ ok: false, error: "LEGACY_ASSISTANT_ENDPOINT_DISABLED" }, { status: 410 })
}

export async function POST() {
  return NextResponse.json({ ok: false, error: "LEGACY_ASSISTANT_ENDPOINT_DISABLED" }, { status: 410 })
}

