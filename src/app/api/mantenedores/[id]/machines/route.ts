import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import {
  MachineDoc,
  getMachinesByIdsChunked,
  listActiveMachines,
} from "@/lib/db/machines";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

const MachinesPayloadSchema = z.object({
  assignedIds: z.array(z.string().min(1)).max(1000).optional(),
});

function resolveId(params: Record<string, string | string[] | undefined>) {
  const idValue = params.id;
  return Array.isArray(idValue) ? idValue[0] ?? null : idValue ?? null;
}

function sanitizeMaintainerMachines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map(item => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 1000);
}

function buildMaintainerPayload(
  maintainer: FirebaseFirestore.DocumentSnapshot,
  assignedIds: string[],
  assignedDocs: MachineDoc[],
  activeDocs: MachineDoc[],
) {
  const maintData = maintainer.data() ?? {};
  const inactiveOrMissingIds = assignedIds.filter(
    id => !activeDocs.some(machine => machine.id === id),
  );

  const response = {
    maintainer: {
      id: maintainer.id,
      nome: typeof maintData.nome === "string" ? maintData.nome : null,
      matricula: typeof maintData.matricula === "string" ? maintData.matricula : null,
    },
    assignedIds,
    assignedDocs,
    activeDocs,
    inactiveOrMissingIds,
  };

  if (inactiveOrMissingIds.length > 0) {
    console.debug("[assign-machines] inactive or missing ids", inactiveOrMissingIds);
  }

  return response;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = (await context.params) ?? {};
  const id = resolveId(params);
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const maintRef = adminDb.collection("mantenedores").doc(id);
  const maintSnap = await maintRef.get();
  if (!maintSnap.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const assignedIds = sanitizeMaintainerMachines(maintSnap.data()?.machines);
  const [assignedDocs, activeDocs] = await Promise.all([
    getMachinesByIdsChunked(assignedIds),
    listActiveMachines(),
  ]);

  const payload = buildMaintainerPayload(maintSnap, assignedIds, assignedDocs, activeDocs);

  console.debug("[assign-machines] assignedIds", payload.assignedIds);
  console.debug(
    "[assign-machines] activeIds",
    payload.activeDocs.map(machine => machine.id),
  );
  console.debug(
    "[assign-machines] inactiveOrMissingIds",
    payload.inactiveOrMissingIds,
  );

  return NextResponse.json(payload);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = (await context.params) ?? {};
  const id = resolveId(params);
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const maintRef = adminDb.collection("mantenedores").doc(id);
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

  const assignedIds = Array.from(new Set(parsed.assignedIds ?? [])).filter(Boolean);

  const [assignedDocs, activeDocs] = await Promise.all([
    getMachinesByIdsChunked(assignedIds),
    listActiveMachines(),
  ]);

  const inactiveOrMissingIds = assignedIds.filter(
    machineId => !activeDocs.some(machine => machine.id === machineId),
  );

  if (inactiveOrMissingIds.length > 0) {
    console.debug("[assign-machines] inactive or missing ids on save", inactiveOrMissingIds);
  }

  const updatedAt = new Date().toISOString();

  await maintRef.update({
    machines: assignedIds,
    updatedAt,
  });

  return NextResponse.json({
    ok: true,
    inactiveOrMissingIds,
    assignedIds,
    assignedDocs,
    activeDocs,
  });
}
