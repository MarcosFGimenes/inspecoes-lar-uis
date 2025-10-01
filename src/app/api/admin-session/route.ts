// src/app/api/admin-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getCookieStore } from "@/lib/cookie-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = getCookieStore();
    const c = cookieStore.get("adminSess")?.value;
    if (!c) return NextResponse.json({ ok: false }, { status: 401 });
    await adminAuth.verifySessionCookie(c, true);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    // 1) Valida o ID token (se falhar aqui, é projeto/token errado)
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    // Opcional: você pode checar claims aqui (ex.: admin)

    // 2) Cria session cookie
    const expiresIn = 1000 * 60 * 60 * 8; // 8h
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    const cookieStore = getCookieStore();
    cookieStore.set("adminSess", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expiresIn / 1000,
      path: "/",
    });

    return NextResponse.json({ ok: true, uid: decoded.uid });
  } catch (error: unknown) {
    // Erros comuns: auth/argument-error (token inválido), projeto diferente, clock skew etc.
    const message = error instanceof Error ? error.message : "INVALID_ID_TOKEN";
    return NextResponse.json({ error: message || "INVALID_ID_TOKEN" }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = getCookieStore();
  cookieStore.delete("adminSess");
  return NextResponse.json({ ok: true });
}
