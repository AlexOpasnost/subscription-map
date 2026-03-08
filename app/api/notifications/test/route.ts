import { NextResponse } from "next/server"

function ts(): string {
  return new Date().toISOString()
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/notifications/test", method: "GET", ts: ts() })
}

export async function POST(_req: Request) {
  return NextResponse.json({ ok: true, route: "/api/notifications/test", method: "POST", ts: ts() })
}

