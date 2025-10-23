import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { updateSignerSeverity } from "@/lib/adapters/dataAdapter";
import type { Severity } from "@/types/severity";
import { requireAdminFromRequest } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  value: z.number().int().min(1).max(6).nullable(),
});

type RouteContext = { params: Promise<{ id?: string } | undefined> };

function extractIssueId(params: { id?: string } | undefined) {
  const id = params?.id;
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
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
    const severityInput = payload.value === null ? null : (payload.value as Severity);
    const severity = await updateSignerSeverity(issueId, severityInput, null);
    return NextResponse.json({ severity });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    const status = message === "ISSUE_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
