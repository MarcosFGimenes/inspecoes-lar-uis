// src/lib/guards.ts
import { getIronSession } from "iron-session";
import { MaintSession, maintSessionOptions } from "./session-maint";
import { adminAuth } from "./firebase-admin";
import { NextRequest } from "next/server";
import { getCookieStore } from "./cookie-store";

export async function requireMaint() {
  const store = await getIronSession<MaintSession>(getCookieStore(), maintSessionOptions);
  if (store?.role !== "maint" || !store.id) {
    return { ok: false as const, status: 401, error: "UNAUTHENTICATED" };
  }
  return { ok: true as const, store };
}

export async function requireAdmin() {
  const cookieStore = getCookieStore();
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
