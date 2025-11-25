import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const curvaCollection = adminDb.collection("curva_servico");

const pointSchema = z.object({
  id: z.string().trim().min(1),
  referencia: z.string().trim().refine(value => !Number.isNaN(new Date(value).getTime()), "INVALID_DATE"),
  planejado: z.number().min(0).max(100).default(0),
  realizado: z.number().min(0).max(100).default(0),
  terceiroPercentual: z.number().min(0).max(100).nullable().optional(),
  terceiroData: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine(value => value === null || !Number.isNaN(new Date(value).getTime()), "INVALID_DATE"),
});

const updateSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        terceiroPercentual: z.number().min(0).max(100).nullable().optional(),
        terceiroData: z.string().datetime().nullable().optional(),
      }),
    )
    .min(1),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const snapshot = await curvaCollection.orderBy("referencia", "asc").get();
  const points = snapshot.docs.map(docSnap => {
    const raw = docSnap.data() ?? {};
    const parsed = pointSchema.safeParse({
      id: docSnap.id,
      referencia: raw.referencia,
      planejado: Number(raw.planejado ?? 0),
      realizado: Number(raw.realizado ?? 0),
      terceiroPercentual: raw.terceiroPercentual ?? null,
      terceiroData: raw.terceiroData ?? null,
    });
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  });

  return NextResponse.json({ points: points.filter(Boolean) });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  let payload: z.infer<typeof updateSchema>;
  try {
    payload = updateSchema.parse(await req.json());
  } catch (err: unknown) {
    const message = err instanceof Error && err.message ? err.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const batch = adminDb.batch();
  for (const update of payload.updates) {
    const ref = curvaCollection.doc(update.id);
    batch.set(
      ref,
      {
        terceiroPercentual: update.terceiroPercentual ?? null,
        terceiroData: update.terceiroData ?? null,
      },
      { merge: true },
    );
  }

  await batch.commit();

  return NextResponse.json({ ok: true });
}
