import { NextResponse } from "next/server";

import {
  callClaudeExtractFieldsRaw,
  parseClaudeExtractedFieldsText,
} from "@/lib/claude";
import type { ExtractionFailureCode } from "@/lib/extraction-failure-reasons";
import { FAILURE_REASON_LABELS } from "@/lib/extraction-failure-reasons";
import { getFileAsBase64 } from "@/lib/google-drive";
import { resolveDocTypeChecklistLabel } from "@/lib/application-checklist";
import { shouldSkipAiExtraction } from "@/lib/oci-new-checklist";
import { reconcileApplication } from "@/lib/cross-doc-reconcile/reconcile-application";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ExtractSingleResultBody } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const STEPS = 4;

function parseSupabaseObjectRef(ref: string): { bucket: string; path: string } | null {
  if (!ref.startsWith("sb:")) return null;
  const raw = ref.slice(3);
  const slash = raw.indexOf("/");
  if (slash <= 0) return null;
  return {
    bucket: raw.slice(0, slash),
    path: raw.slice(slash + 1),
  };
}

async function getDocumentAsBase64(ref: string): Promise<string> {
  const sbRef = parseSupabaseObjectRef(ref);
  if (!sbRef) return getFileAsBase64(ref);

  const { data, error } = await supabaseAdmin.storage
    .from(sbRef.bucket)
    .download(sbRef.path);
  if (error || !data) {
    throw new Error(`Failed to download storage object: ${error?.message ?? "Unknown error"}`);
  }

  const ab = await data.arrayBuffer();
  return Buffer.from(ab).toString("base64");
}

async function markDocument(
  docId: string,
  fields: {
    extraction_status: "pending" | "processing" | "done" | "failed";
    failure_reason?: string | null;
  }
) {
  await supabaseAdmin.from("documents").update(fields).eq("id", docId);
}

function failPayload(
  code: ExtractionFailureCode,
  fields_extracted = 0
): ExtractSingleResultBody {
  return {
    ok: true,
    status: "failed",
    reason: code,
    human_reason: FAILURE_REASON_LABELS[code],
    fields_extracted,
    field_data: [],
  };
}

type EmitProgress = (p: {
  step: number;
  documentIndex: number;
  documentTotal: number;
  message: string;
}) => void;

async function runExtraction(args: {
  doc: Record<string, unknown>;
  application_id: string;
  documentIndex: number;
  documentTotal: number;
  emit?: EmitProgress;
}): Promise<ExtractSingleResultBody> {
  const { doc, application_id, documentIndex, documentTotal, emit } = args;
  const docId = String(doc.id);
  const docType = String(doc.doc_type ?? "");
  const docLabel = resolveDocTypeChecklistLabel(docType);

  const progress = (step: number, message: string) => {
    emit?.({
      step,
      documentIndex,
      documentTotal,
      message: `Step ${step} of ${STEPS}: ${message}`,
    });
  };

  if (shouldSkipAiExtraction(docType)) {
    await markDocument(docId, {
      extraction_status: "done",
      failure_reason: null,
    });
    return {
      ok: true,
      status: "done",
      fields_extracted: 0,
      field_data: [],
      skipped: true,
      document_id: docId,
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    await markDocument(docId, {
      extraction_status: "failed",
      failure_reason: "claude_api_failed",
    });
    return {
      ...failPayload("claude_api_failed"),
      human_reason: "AI API key is not configured",
      document_id: docId,
    };
  }

  await markDocument(docId, {
    extraction_status: "processing",
    failure_reason: null,
  });

  progress(
    1,
    `Downloading ${docLabel} from Drive…`
  );

  let b64: string;
  try {
    b64 = await getDocumentAsBase64(String(doc.drive_file_id ?? ""));
  } catch {
    await markDocument(docId, {
      extraction_status: "failed",
      failure_reason: "drive_download_failed",
    });
    return { ...failPayload("drive_download_failed"), document_id: docId };
  }

  if (!b64 || b64.length === 0) {
    await markDocument(docId, {
      extraction_status: "failed",
      failure_reason: "drive_download_failed",
    });
    return { ...failPayload("drive_download_failed"), document_id: docId };
  }

  progress(2, "Sending to AI…");

  let rawText: string;
  try {
    rawText = await callClaudeExtractFieldsRaw({
      base64: b64,
      mimeType: "application/pdf",
      docType,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Claude API error:", msg);
    await markDocument(docId, {
      extraction_status: "failed",
      failure_reason: "claude_api_failed",
    });
    return {
      ...failPayload("claude_api_failed"),
      human_reason: msg.slice(0, 200) || FAILURE_REASON_LABELS.claude_api_failed,
      document_id: docId,
    };
  }

  progress(3, "Parsing results…");

  let extracted: Record<string, string | null>;
  try {
    extracted = parseClaudeExtractedFieldsText(rawText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Parse error:", msg);
    await markDocument(docId, {
      extraction_status: "failed",
      failure_reason: "parse_failed",
    });
    return {
      ...failPayload("parse_failed"),
      human_reason: msg.slice(0, 200) || FAILURE_REASON_LABELS.parse_failed,
      document_id: docId,
    };
  }

  const entries = Object.entries(extracted);
  progress(
    4,
    entries.length === 0
      ? "Saving results…"
      : `Saving ${entries.length} field${entries.length === 1 ? "" : "s"}…`
  );

  const field_data: { field_name: string; field_value: string | null }[] = [];

  try {
    // Replace all fields for this doc type so re-extraction never leaves stale rows.
    const { error: delErr } = await supabaseAdmin
      .from("extracted_fields")
      .delete()
      .eq("application_id", application_id)
      .eq("source_doc_type", docType);
    if (delErr) throw new Error(delErr.message);

    // is_flagged is never derived from extraction — only manual 🚩 on review page.
    for (const [field_name, field_value] of entries) {
      const { error: insErr } = await supabaseAdmin.from("extracted_fields").insert({
        application_id,
        field_name,
        field_value,
        source_doc_type: docType,
        is_flagged: false,
        flag_note: "",
      });
      if (insErr) throw new Error(insErr.message);
      field_data.push({ field_name, field_value: field_value ?? null });
    }

    await markDocument(docId, {
      extraction_status: "done",
      failure_reason: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("DB save error:", msg);
    await markDocument(docId, {
      extraction_status: "failed",
      failure_reason: "db_save_failed",
    });
    return {
      ...failPayload("db_save_failed"),
      human_reason: msg.slice(0, 200) || FAILURE_REASON_LABELS.db_save_failed,
      fields_extracted: field_data.length,
      field_data,
      document_id: docId,
    };
  }

  void reconcileApplication(application_id).catch((e) =>
    console.error("reconcileApplication after extract/single:", e)
  );

  return {
    ok: true,
    status: "done",
    fields_extracted: field_data.length,
    field_data,
    document_id: docId,
  };
}

export async function POST(req: Request) {
  let body: {
    application_id?: string;
    document_id?: string;
    stream?: boolean;
    document_index?: number;
    document_total?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const application_id = String(body.application_id ?? "").trim();
  const document_id = String(body.document_id ?? "").trim();
  const useStream = Boolean(body.stream);
  const documentIndex = Math.max(1, Number(body.document_index) || 1);
  const documentTotal = Math.max(1, Number(body.document_total) || 1);

  if (!application_id || !document_id) {
    return NextResponse.json(
      { ok: false, error: "application_id and document_id are required." },
      { status: 400 }
    );
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("id", document_id)
    .eq("application_id", application_id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json(
      { ok: false, error: "Document not found." },
      { status: 404 }
    );
  }

  const docRow = doc as Record<string, unknown>;

  if (useStream) {
    const encoder = new TextEncoder();
    const docLabel = resolveDocTypeChecklistLabel(String(docRow.doc_type ?? ""));
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };
        try {
          send({
            type: "doc_start",
            documentIndex,
            documentTotal,
            message: `Document ${documentIndex} of ${documentTotal}: ${docLabel}`,
          });
          const result = await runExtraction({
            doc: docRow,
            application_id,
            documentIndex,
            documentTotal,
            emit: (p) => send({ type: "progress", totalSteps: STEPS, ...p }),
          });
          send({ type: "result", ...result });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          send({
            type: "result",
            ok: true,
            status: "failed" as const,
            reason: "db_save_failed",
            human_reason: msg.slice(0, 300),
            fields_extracted: 0,
            field_data: [] as { field_name: string; field_value: string | null }[],
            document_id: document_id,
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const result = await runExtraction({
      doc: docRow,
      application_id,
      documentIndex,
      documentTotal,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markDocument(document_id, {
      extraction_status: "failed",
      failure_reason: "db_save_failed",
    });
    return NextResponse.json(
      {
        ok: true,
        status: "failed" as const,
        reason: "db_save_failed",
        human_reason: msg.slice(0, 300),
        fields_extracted: 0,
        field_data: [],
        document_id,
      },
      { status: 200 }
    );
  }
}
