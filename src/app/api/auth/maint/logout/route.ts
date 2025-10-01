import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { maintSessionOptions, MaintSession } from "@/lib/session-maint";

export async function POST() {
  const session = await getIronSession<MaintSession>(await cookies(), maintSessionOptions);
  session.destroy();
  return NextResponse.json({ ok: true });
}
