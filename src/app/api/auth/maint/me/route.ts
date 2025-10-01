import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { maintSessionOptions, MaintSession } from "@/lib/session-maint";

export async function GET() {
  const store = await getIronSession<MaintSession>(await cookies(), maintSessionOptions);
  if (!store?.id || store?.role !== "maint") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, store });
}
