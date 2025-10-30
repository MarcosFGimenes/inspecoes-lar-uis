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

export async function requireMaintOrAdmin(req: NextRequest) {
  const maintAuth = await requireMaint();
  if (maintAuth.ok) {
    return { ok: true as const, role: "maint" as const, store: maintAuth.store };
  }

  const adminOk = await requireAdminFromRequest(req);
  if (adminOk) {
    return { ok: true as const, role: "admin" as const };
  }

  return { ok: false as const, status: maintAuth.status, error: maintAuth.error };
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
