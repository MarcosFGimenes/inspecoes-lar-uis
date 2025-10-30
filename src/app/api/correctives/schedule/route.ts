import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createOrUpdateCorrectiveWO } from "@/lib/adapters/correctiveAdapter";
import { requireMaintOrAdmin } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assigneesSchema = z.object({
  owner: z.string().min(1),
  maintainer1: z.string().min(1).optional(),
  maintainer2: z.string().min(1).optional(),
});

const severity6Schema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

const ncContextSchema = z
  .object({
    description: z.string().nullable().optional(),
    area: z.enum(["mechanical", "electrical"]).nullable().optional(),
    effectiveSeverity: severity6Schema.nullable().optional(),
    severity: z
      .object({
        signer: severity6Schema.nullable().optional(),
        maintainer: severity6Schema.nullable().optional(),
      })
      .nullable()
      .optional(),
    inspectionId: z.string().min(1).optional(),
    source: z.string().optional(),
  })
  .optional();

const scheduleSchema = z
  .object({
    ncId: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    area: z.enum(["mechanical", "electrical"]),
    assignees: assigneesSchema,
    scheduledDate: z.string().min(1),
    dueDate: z.string().min(1).optional(),
    ncContext: ncContextSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.ncId && !value.description) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DESCRIPTION_REQUIRED",
        path: ["description"],
      });
    }

    const scheduled = new Date(value.scheduledDate);
    if (Number.isNaN(scheduled.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INVALID_SCHEDULED_DATE",
        path: ["scheduledDate"],
      });
    }

    if (value.dueDate) {
      const due = new Date(value.dueDate);
      if (Number.isNaN(due.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "INVALID_DUE_DATE",
          path: ["dueDate"],
        });
      }
    }
  });

export async function POST(req: NextRequest) {
  const auth = await requireMaintOrAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  let payload: z.infer<typeof scheduleSchema>;
  try {
    const body = await req.json();
    payload = scheduleSchema.parse(body);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const { osId } = await createOrUpdateCorrectiveWO(payload);
    return NextResponse.json({ osId });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
