// src/lib/guards.ts
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { MaintSession, maintSessionOptions } from "./session-maint";
import { adminAuth } from "./firebase-admin";
import { NextRequest } from "next/server";

export async function requireMaint() {
  const store = await getIronSession<MaintSession>(await cookies(), maintSessionOptions);
  if (store?.role !== "maint" || !store.id) {
    return { ok: false as const, status: 401, error: "UNAUTHENTICATED" };
  }
  return { ok: true as const, store };
}

export async function requireAdmin() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("adminSess")?.value;
  if (!cookie) {
    return { ok: false as const, status: 401, error: "UNAUTHENTICATED" };
  }
  try {
    await adminAuth.verifySessionCookie(cookie, true);
    return { ok: true as const };
  } catch {
    return { ok: false as const, status: 401, error: "UNAUTHENTICATED" };
  }
}

export async function requireAdminFromRequest(req: NextRequest) {
  const cookie = req.cookies.get("adminSess")?.value;
  if (!cookie) return false;
  try {
    await adminAuth.verifySessionCookie(cookie, true);
    return true;
  } catch {
    return false;
  }
}
