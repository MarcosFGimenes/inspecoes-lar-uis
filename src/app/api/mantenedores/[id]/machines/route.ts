import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: {
    id: string;
  };
}

const MachinesPayloadSchema = z.object({
  machines: z
    .array(z.string().min(1))
    .max(1000)
    .optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const maintRef = adminDb.collection("mantenedores").doc(params.id);
  const maintSnap = await maintRef.get();
  if (!maintSnap.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = MachinesPayloadSchema.parse(body);
  } catch (err: unknown) {
    const message = err instanceof Error && err.message ? err.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const machines = Array.from(new Set(parsed.machines ?? [])).filter(Boolean);

  if (machines.length > 0) {
    const machineSnapshots = await Promise.all(
      machines.map(machineId => adminDb.collection("maquinas").doc(machineId).get())
    );
    const missing = machines.filter((_, index) => !machineSnapshots[index].exists);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "MACHINE_NOT_FOUND", details: { missing } },
        { status: 400 }
      );
    }
  }

  const updatedAt = new Date().toISOString();

  await maintRef.update({
    machines,
    updatedAt,
  });

  const updatedSnap = await maintRef.get();
  return NextResponse.json({ id: params.id, ...updatedSnap.data() });
}
