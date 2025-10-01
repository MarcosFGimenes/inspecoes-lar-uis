// src/app/api/admin-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const c = cookieStore.get("adminSess")?.value;
    if (!c) return NextResponse.json({ ok: false }, { status: 401 });
    await adminAuth.verifySessionCookie(c, true);
    return NextResponse.json({ ok: true });
  } catch (e) {
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

    const cookieStore = await cookies();
    cookieStore.set("adminSess", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expiresIn / 1000,
      path: "/",
    });

    return NextResponse.json({ ok: true, uid: decoded.uid });
  } catch (e: any) {
    // Erros comuns: auth/argument-error (token inválido), projeto diferente, clock skew etc.
    return NextResponse.json(
      { error: e?.message || "INVALID_ID_TOKEN" },
      { status: 401 }
    );
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("adminSess");
  return NextResponse.json({ ok: true });
}
