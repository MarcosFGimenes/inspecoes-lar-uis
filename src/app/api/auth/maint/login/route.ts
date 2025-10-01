import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { maintSessionOptions, MaintSession } from "@/lib/session-maint";

export async function POST(req: NextRequest) {
  const { matricula, password } = await req.json();

  if (!matricula || !password) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const snap = await adminDb
    .collection("mantenedores")
    .where("matricula", "==", String(matricula))
    .limit(1)
    .get();

  if (snap.empty) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const doc = snap.docs[0];
  const data = doc.data() as any;

  if (!data.ativo) return NextResponse.json({ error: "Usuário inativo" }, { status: 403 });

  const ok = await bcrypt.compare(password, data.passwordHash);
  if (!ok) return NextResponse.json({ error: "Senha inválida" }, { status: 401 });

  const session = await getIronSession<MaintSession>(await cookies(), maintSessionOptions);
  session.id = doc.id;
  session.matricula = data.matricula;
  session.nome = data.nome;
  session.role = "maint";
  await session.save();

  return NextResponse.json({ ok: true });
}
