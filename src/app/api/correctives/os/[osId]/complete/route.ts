import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { completeCorrectiveWorkOrder } from "@/lib/adapters/correctiveAdapter";
import { requireMaintOrAdmin } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

const payloadSchema = z.object({
  completedAt: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
});

function resolveOsId(params: Record<string, string | string[] | undefined>) {
  const value = params.osId;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireMaintOrAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const params = (await context.params) ?? {};
  const osId = resolveOsId(params)?.trim();
  if (!osId) {
    return NextResponse.json({ error: "OS_ID_REQUIRED" }, { status: 400 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError && error.issues.length > 0 ? error.issues[0]?.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const result = await completeCorrectiveWorkOrder({
      osId,
      completedAt: payload.completedAt,
      notes: payload.notes ?? null,
      completedBy: auth.role === "maint" ? auth.store.id! : "admin",
      completedByName: auth.role === "maint" ? auth.store.nome ?? null : null,
      completedByMatricula: auth.role === "maint" ? auth.store.matricula ?? null : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "CORRECTIVE_OS_NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
