import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import bcrypt from "bcryptjs";
import { z } from "zod";

const MaintainerSchema = z.object({
  matricula: z.string().min(1),
  nome: z.string().min(2),
  setor: z.string().min(2),
  lac: z.string().regex(/^\d{3}$/),
  ativo: z.boolean(),
  password: z.string().min(8),
});

async function requireAdminSession(req: NextRequest) {
  const cookie = req.cookies.get("adminSess")?.value;
  if (!cookie) return null;
  try {
    await adminAuth.verifySessionCookie(cookie, true);
    return true;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession(req))) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase();
  let ref = adminDb.collection("mantenedores").orderBy("createdAt", "desc").limit(50);
  if (q) {
    // Firestore não suporta OR, então só busca por matrícula exata ou nome começa com
    ref = ref.where("matricula", "==", q);
  }
  const snap = await ref.get();
  let mantenedores = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  if (q) {
    // Filtro local por nome
    mantenedores = mantenedores.filter(m => m.nome.toLowerCase().includes(q));
  }
  return NextResponse.json(mantenedores);
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession(req))) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  let data: z.infer<typeof MaintainerSchema>;
  try {
    data = MaintainerSchema.parse(await req.json());
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Invalid payload" },
        { status: 422 }
      );
    }
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 422 });
  }
  // Unicidade
  const exists = await adminDb.collection("mantenedores").where("matricula", "==", data.matricula).limit(1).get();
  if (!exists.empty) {
    return NextResponse.json({ error: "Matrícula já existe" }, { status: 409 });
  }
  const passwordHash = await bcrypt.hash(data.password, 10);
  const doc = await adminDb.collection("mantenedores").add({
    matricula: data.matricula,
    nome: data.nome,
    setor: data.setor,
    lac: data.lac,
    ativo: data.ativo,
    passwordHash,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ id: doc.id, ...data, password: undefined });
}
