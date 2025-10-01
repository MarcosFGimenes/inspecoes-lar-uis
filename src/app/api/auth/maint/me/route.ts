import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { maintSessionOptions, MaintSession } from "@/lib/session-maint";
import { getCookieStore } from "@/lib/cookie-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getIronSession<MaintSession>(getCookieStore(), maintSessionOptions);
  if (!store?.id || store?.role !== "maint") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, store });
}
