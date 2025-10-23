import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { updateMaintainerSeverity } from "@/lib/adapters/dataAdapter";
import { requireMaint } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  value: z.number().int().min(1).max(5),
});

type RouteContext = { params: Promise<{ id?: string } | undefined> };

function extractIssueId(params: { id?: string } | undefined) {
  const id = params?.id;
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const params = await context.params;
  const issueId = extractIssueId(params);
  if (!issueId) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const severity = await updateMaintainerSeverity(issueId, payload.value, auth.store.id ?? null);
    return NextResponse.json({ severity });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    const status = message === "ISSUE_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
