import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { uploadToImgbbFromDataUrl } from "@/lib/imgbb";
import type {
  ChecklistAnswer,
  ChecklistNonConformityTreatment,
  ChecklistResponse,
  NonConformityStatus,
} from "@/types";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

const itemPhotoSchema = z.union([
  z.string().trim().min(1),
  z.object({
    dataUrl: z.string().trim().min(1),
    name: z.string().trim().optional(),
  }),
]);

const patchSchema = z.object({
  osNumero: z.string().trim().optional(),
  observacoes: z.string().trim().optional(),
  assinaturaDataUrl: z.string().trim().optional(),
  itens: z
    .array(
      z.object({
        questionId: z.string().trim().min(1),
        response: z.enum(["c", "nc", "na"]),
        observation: z.string().trim().optional(),
        photoUrls: z.array(itemPhotoSchema).max(5).optional(),
      })
    )
    .optional(),
});

type PatchPayload = z.infer<typeof patchSchema>;

type TemplateItem = {
  id?: string;
  componente?: string;
  oQueChecar?: string;
  instrumento?: string;
  criterio?: string;
  oQueFazer?: string;
};

function resolveId(params: Record<string, string | string[] | undefined>) {
  const value = params.id;
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeAnswers(data: Record<string, unknown>, templateItemsMap: Map<string, TemplateItem>) {
  const answers = Array.isArray(data.answers) ? (data.answers as ChecklistAnswer[]) : [];
  if (answers.length > 0) {
    return answers
      .filter(item => item?.questionId)
      .map(item => ({
        questionId: item.questionId,
        questionText:
          item.questionText ?? templateItemsMap.get(item.questionId)?.oQueChecar ?? templateItemsMap.get(item.questionId)?.criterio ?? null,
        response: item.response === "nc" || item.response === "na" ? item.response : "c",
        observation: item.observation ?? null,
        photoUrls: Array.isArray(item.photoUrls) ? item.photoUrls.filter(Boolean) : [],
        recurrence: item.recurrence ?? false,
      }));
  }

  const itens = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  return itens
    .filter(item => item?.templateItemId)
    .map(item => {
      const questionId = String(item.templateItemId);
      const templateItem = templateItemsMap.get(questionId) ?? {};
      const resultado = String(item.resultado || "C").toLowerCase();
      const response: "c" | "nc" | "na" = resultado === "nc" ? "nc" : resultado === "na" ? "na" : "c";
      return {
        questionId,
        questionText: templateItem.oQueChecar ?? templateItem.criterio ?? (typeof item.componente === "string" ? item.componente : null),
        response,
        observation: typeof item.observacaoItem === "string" ? item.observacaoItem : null,
        photoUrls: Array.isArray(item.fotos) ? item.fotos.filter(Boolean).map(String) : [],
        recurrence: false,
      } satisfies ChecklistAnswer;
    });
}

function mapTemplateItems(templateData: Record<string, unknown>) {
  const items = Array.isArray(templateData.itens) ? (templateData.itens as TemplateItem[]) : [];
  return new Map(items.filter(item => item?.id).map(item => [String(item.id), item]));
}

function ensureChecklistResponse(docId: string, data: Record<string, unknown>): ChecklistResponse {
  return {
    id: docId,
    machine: (data.machine ?? null) as ChecklistResponse["machine"],
    template: (data.template ?? null) as ChecklistResponse["template"],
    maintainer: (data.maintainer ?? null) as ChecklistResponse["maintainer"],
    answers: Array.isArray(data.answers) ? (data.answers as ChecklistAnswer[]) : undefined,
    itens: data.itens,
    nonConformityTreatments: Array.isArray(data.nonConformityTreatments)
      ? (data.nonConformityTreatments as ChecklistNonConformityTreatment[])
      : undefined,
    observacoes: data.observacoes ? String(data.observacoes) : undefined,
    osNumero: data.osNumero ? String(data.osNumero) : undefined,
    assinaturaUrl: data.assinaturaUrl ? String(data.assinaturaUrl) : undefined,
    pcmSign: (data.pcmSign ?? null) as ChecklistResponse["pcmSign"],
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
    iniciadaEm: data.iniciadaEm ? String(data.iniciadaEm) : undefined,
    finalizadaEm: data.finalizadaEm ? String(data.finalizadaEm) : undefined,
    qtdNC: typeof data.qtdNC === "number" ? data.qtdNC : undefined,
  };
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const params = (await context.params) ?? {};
  const id = resolveId(params);
  if (!id) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  try {
    const docRef = adminDb.collection("inspecoes").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const data = docSnap.data() ?? {};
    const inspection = ensureChecklistResponse(docSnap.id, data);

    const templateId = inspection.template?.id || inspection.machine?.templateId || null;
    let templateData: Record<string, unknown> | null = null;
    if (templateId) {
      const templateSnap = await adminDb.collection("templates").doc(String(templateId)).get();
      if (templateSnap.exists) {
        templateData = templateSnap.data() ?? null;
      }
    }

    const templateItemsMap = templateData ? mapTemplateItems(templateData) : new Map<string, TemplateItem>();
    const normalizedAnswers = normalizeAnswers(data, templateItemsMap);

    return NextResponse.json({
      inspection: {
        ...inspection,
        answers: normalizedAnswers,
      },
      template: templateData ? { id: templateId, ...(templateData ?? {}) } : null,
      machine: inspection.machine ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const params = (await context.params) ?? {};
  const id = resolveId(params);
  if (!id) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  let payload: PatchPayload;
  try {
    payload = patchSchema.parse(await req.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const docRef = adminDb.collection("inspecoes").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const data = docSnap.data() ?? {};
    const inspection = ensureChecklistResponse(docSnap.id, data);

    const templateId = inspection.template?.id || inspection.machine?.templateId || null;
    let templateData: Record<string, unknown> | null = null;
    if (templateId) {
      const templateSnap = await adminDb.collection("templates").doc(String(templateId)).get();
      if (templateSnap.exists) {
        templateData = templateSnap.data() ?? null;
      }
    }
    const templateItemsMap = templateData ? mapTemplateItems(templateData) : new Map<string, TemplateItem>();

    const currentAnswers = normalizeAnswers(data, templateItemsMap);

    const currentTreatmentsArray = Array.isArray(inspection.nonConformityTreatments)
      ? (inspection.nonConformityTreatments as ChecklistNonConformityTreatment[])
      : [];
    const treatmentsMap = new Map(currentTreatmentsArray.map(item => [item.questionId, item]));

    const nowIso = new Date().toISOString();

    const updates: Record<string, unknown> = {};

    if (typeof payload.osNumero !== "undefined") {
      updates.osNumero = payload.osNumero.trim() ? payload.osNumero.trim() : null;
    }
    if (typeof payload.observacoes !== "undefined") {
      updates.observacoes = payload.observacoes.trim() ? payload.observacoes.trim() : null;
    }

    if (payload.assinaturaDataUrl) {
      const upload = await uploadToImgbbFromDataUrl(payload.assinaturaDataUrl, `pcm-sign-${id}`);
      updates.pcmSign = {
        ...(inspection.pcmSign ?? {}),
        assinaturaUrl: upload.url,
        signedAt: nowIso,
      };
    }

    const openIssuesSnap = inspection.machine?.machineId
      ? await adminDb
          .collection("issues")
          .where("machineId", "==", inspection.machine.machineId)
          .where("status", "==", "aberta")
          .get()
      : null;

    const openIssuesMap = new Map<string, QueryDocumentSnapshot<DocumentData>>();
    if (openIssuesSnap) {
      openIssuesSnap.docs.forEach(doc => {
        const issueData = doc.data() ?? {};
        if (issueData.templateItemId) {
          openIssuesMap.set(String(issueData.templateItemId), doc);
        }
      });
    }

    const answersToPersist: ChecklistAnswer[] = currentAnswers.map(answer => ({
      questionId: answer.questionId,
      questionText: answer.questionText ?? null,
      response: answer.response === "nc" ? "nc" : answer.response === "na" ? "na" : "c",
      observation: answer.observation ?? null,
      photoUrls: Array.isArray(answer.photoUrls) ? answer.photoUrls.filter(Boolean) : [],
      recurrence: answer.recurrence ?? false,
    }));
    const answersPersistMap = new Map(answersToPersist.map(answer => [answer.questionId, answer]));
    const itensToPersist: Array<Record<string, unknown>> = Array.isArray(data.itens)
      ? (data.itens as Array<Record<string, unknown>>).map(item => ({ ...item }))
      : [];

    const itensMap = new Map<string, Record<string, unknown>>();
    itensToPersist.forEach(item => {
      if (item.templateItemId) {
        itensMap.set(String(item.templateItemId), item);
      }
    });

    const issuesCriadas = Array.isArray(data.issuesCriadas) ? [...(data.issuesCriadas as string[])] : [];
    const issuesResolvidas = Array.isArray(data.issuesResolvidas) ? [...(data.issuesResolvidas as string[])] : [];

    const osNumeroValue =
      typeof updates.osNumero !== "undefined"
        ? (updates.osNumero as string | null)
        : inspection.osNumero ?? null;

    if (payload.itens) {
      for (const item of payload.itens) {
        const templateItem = templateItemsMap.get(item.questionId) ?? null;
        if (templateItemsMap.size > 0 && !templateItem) {
          continue;
        }
        const existingAnswer = answersPersistMap.get(item.questionId);
        if (existingAnswer && !existingAnswer.questionText && templateItem) {
          existingAnswer.questionText = templateItem.oQueChecar ?? templateItem.criterio ?? existingAnswer.questionText ?? null;
        }
        const response = item.response;

        const photoUrls: string[] = [];
        if (Array.isArray(item.photoUrls)) {
          for (const photo of item.photoUrls) {
            if (typeof photo === "string") {
              photoUrls.push(photo);
            } else if (photo?.dataUrl) {
              const upload = await uploadToImgbbFromDataUrl(photo.dataUrl, `${id}-${item.questionId}-${photo.name ?? "foto"}`);
              photoUrls.push(upload.url);
            }
          }
        } else if (existingAnswer?.photoUrls) {
          photoUrls.push(...existingAnswer.photoUrls);
        }

        const observation = item.observation?.trim() ? item.observation.trim() : null;

        if (existingAnswer) {
          existingAnswer.response = response;
          existingAnswer.observation = observation;
          if (photoUrls.length > 0 || item.photoUrls) {
            existingAnswer.photoUrls = photoUrls;
          }
        } else {
          const created = {
            questionId: item.questionId,
            questionText: templateItem?.oQueChecar ?? templateItem?.criterio ?? null,
            response,
            observation,
            photoUrls,
          } satisfies ChecklistAnswer;
          answersToPersist.push(created);
          answersPersistMap.set(item.questionId, created);
        }

        const existingItemEntry = itensMap.get(item.questionId);
        if (existingItemEntry) {
          existingItemEntry.resultado = response.toUpperCase();
          existingItemEntry.observacaoItem = observation;
          if (photoUrls.length > 0 || item.photoUrls) {
            existingItemEntry.fotos = photoUrls;
          }
        } else {
          itensToPersist.push({
            templateItemId: item.questionId,
            resultado: response.toUpperCase(),
            observacaoItem: observation,
            fotos: photoUrls,
          });
        }

        const existingTreatment = treatmentsMap.get(item.questionId);
        if (response === "nc") {
          const updatedTreatment = existingTreatment
            ? {
                ...existingTreatment,
                status: existingTreatment.status === "resolved" ? "open" : existingTreatment.status,
                updatedAt: nowIso,
              }
            : {
                questionId: item.questionId,
                status: "open" as NonConformityStatus,
                createdAt: nowIso,
              };
          treatmentsMap.set(item.questionId, updatedTreatment);

          if (openIssuesMap.has(item.questionId)) {
            const issueDoc = openIssuesMap.get(item.questionId)!;
            if (osNumeroValue && issueDoc.data()?.osNumero !== osNumeroValue) {
              await issueDoc.ref.update({ osNumero: osNumeroValue });
            }
          } else if (inspection.machine?.machineId) {
            const issueRef = adminDb.collection("issues").doc();
            await issueRef.set({
              machineId: inspection.machine.machineId,
              tag: inspection.machine.tag ?? null,
              templateItemId: item.questionId,
              descricao:
                observation ||
                templateItem?.criterio ||
                templateItem?.oQueChecar ||
                "NC registrada na edição da inspeção",
              osNumero: osNumeroValue,
              status: "aberta",
              abertaEmInspecaoId: id,
              createdAt: nowIso,
            });
            issuesCriadas.push(issueRef.id);
          }
        } else {
          if (existingTreatment) {
            treatmentsMap.set(item.questionId, {
              ...existingTreatment,
              status: "resolved",
              updatedAt: nowIso,
            });
          }
          const issueDoc = openIssuesMap.get(item.questionId);
          if (issueDoc) {
            await issueDoc.ref.update({
              status: "resolvida",
              resolvedAt: nowIso,
              resolvidaEmInspecaoId: id,
            });
            if (!issuesResolvidas.includes(issueDoc.id)) {
              issuesResolvidas.push(issueDoc.id);
            }
            openIssuesMap.delete(item.questionId);
          }
        }
      }
    }

    const treatmentsArray = Array.from(treatmentsMap.values());

    const finalAnswers = answersToPersist.map(answer => ({
      ...answer,
      response: answer.response === "nc" || answer.response === "na" ? answer.response : "c",
      photoUrls: Array.isArray(answer.photoUrls) ? answer.photoUrls.filter(Boolean) : [],
    }));

    const qtdNC = finalAnswers.filter(answer => answer.response === "nc").length;

    updates.answers = finalAnswers;
    updates.itens = itensToPersist.map(item => ({
      ...item,
      resultado: typeof item.resultado === "string" ? item.resultado : "C",
      fotos: Array.isArray(item.fotos) ? item.fotos : [],
    }));
    updates.nonConformityTreatments = treatmentsArray;
    updates.qtdNC = qtdNC;
    updates.updatedAt = nowIso;
    updates.issuesCriadas = issuesCriadas;
    updates.issuesResolvidas = issuesResolvidas;

    await docRef.update(updates);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
