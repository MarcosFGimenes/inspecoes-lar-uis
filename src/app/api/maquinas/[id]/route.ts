import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/guards";
import { machineSchema } from "@/lib/machines-schema";
import { findMachineByTag, resolveMachineDocumentById } from "@/lib/db/machines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function resolveId(params: Record<string, string | string[] | undefined>) {
  const idValue = params.id;
  return Array.isArray(idValue) ? idValue[0] ?? null : idValue ?? null;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const params = (await context.params) ?? {};
    const id = resolveId(params);
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const handle = await resolveMachineDocumentById(id);
    if (!handle) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(handle.data);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
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

  const handle = await resolveMachineDocumentById(id);
  if (!handle) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = machineSchema.parse(body);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INVALID_PAYLOAD") },
      { status: 422 }
    );
  }

  try {
    if ((parsed.tag ?? "") !== (handle.data.tag ?? "")) {
      const duplicate = await findMachineByTag(parsed.tag);
      if (duplicate && duplicate.id !== id) {
        return NextResponse.json({ error: "TAG_DUPLICATE" }, { status: 409 });
      }
    }

    await handle.ref.update({
      ...parsed,
      fotoUrl: parsed.fotoUrl ?? null,
    });

    return NextResponse.json({
      id,
      ...parsed,
      createdAt: handle.data.createdAt ?? null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const params = (await context.params) ?? {};
    const id = resolveId(params);
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const handle = await resolveMachineDocumentById(id);
    if (!handle) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    await handle.ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}
