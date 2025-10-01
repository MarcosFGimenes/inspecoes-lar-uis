import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { maintSessionOptions, MaintSession } from "@/lib/session-maint";
import { getCookieStore } from "@/lib/cookie-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getIronSession<MaintSession>(getCookieStore(), maintSessionOptions);
  session.destroy();
  return NextResponse.json({ ok: true });
}
