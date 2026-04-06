import { NextResponse } from "next/server";

import { getChecklistForApplication } from "@/lib/application-checklist";
import { normalizeStoredOciIntakeVariant } from "@/lib/oci-intake-variant";
import { shouldSkipAiExtraction } from "@/lib/oci-new-checklist";
import { extractFieldsFromDocument } from "@/lib/claude";
import {
  analyzeDocumentQuality,
  type DocumentQualityResult,
} from "@/lib/document-quality-gate";
import { resolveMimeTypeForExtraction } from "@/lib/extraction-mime";
import { getFileAsBase64 } from "@/lib/google-drive";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Application } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

// Kept for reference: multi-document extraction loop.
export async function POST(req: Request) {
  try {
    console.log("POST /api/extract/all hit");
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as { application_id?: string };
    const application_id = (body.application_id ?? "").trim();
    if (!application_id) {
      return NextResponse.json(
        { error: "application_id is required." },
        { status: 400 }
      );
    }

    const { data: appRow } = await supabaseAdmin
      .from("applications")
      .select("service_type, is_minor, oci_intake_variant")
      .eq("id", application_id)
      .maybeSingle();

    const { data: allDocRows, error: listError } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("application_id", application_id);

    if (listError) {
      return NextResponse.json(
        { error: `Failed to list documents: ${listError.message}` },
        { status: 500 }
      );
    }

    const allDocs = allDocRows ?? [];
    const byType = new Map(
      allDocs.map((d) => [String((d as { doc_type?: string }).doc_type ?? ""), d]),
    );

    const serviceType =
      (appRow?.service_type as Application["service_type"]) ?? "oci_new";
    const passportRouting = {
      serviceType,
      ociIntakeVariant: normalizeStoredOciIntakeVariant(
        appRow?.oci_intake_variant
      ),
    };
    const checklist = getChecklistForApplication({
      service_type: serviceType,
      is_minor: appRow?.is_minor === true,
      oci_intake_variant: normalizeStoredOciIntakeVariant(
        appRow?.oci_intake_variant
      ),
    });
    const skipped_not_uploaded = checklist
      .filter((item) => !byType.has(item.doc_type))
      .map((item) => ({
        doc_type: item.doc_type,
        label: item.label,
        reason: "not_uploaded" as const,
      }));

    const pending = allDocs.filter(
      (d) =>
        d.extraction_status === "pending" &&
        !shouldSkipAiExtraction(String((d as { doc_type?: string }).doc_type ?? ""), {
          serviceType,
        })
    );
    let docsProcessed = 0;
    let fieldsExtracted = 0;

    const document_results: Array<{
      document_id: string;
      doc_type: string;
      status: "extracted" | "failed";
      quality?: DocumentQualityResult;
    }> = [];

    for (const doc of pending) {
      let quality: DocumentQualityResult | undefined;
      try {
        await supabaseAdmin
          .from("documents")
          .update({ extraction_status: "processing" })
          .eq("id", doc.id);

        const b64 = await getDocumentAsBase64(doc.drive_file_id);
        if (!b64) {
          await supabaseAdmin
            .from("documents")
            .update({ extraction_status: "failed" })
            .eq("id", doc.id);
          document_results.push({
            document_id: String(doc.id),
            doc_type: String(doc.doc_type ?? ""),
            status: "failed",
          });
          continue;
        }

        const mimeType = await resolveMimeTypeForExtraction(
          String(doc.drive_file_id ?? ""),
          String((doc as { file_name?: string }).file_name ?? "")
        );
        try {
          quality = await analyzeDocumentQuality({
            buffer: Buffer.from(b64, "base64"),
            mimeType,
            fileName: String((doc as { file_name?: string }).file_name ?? ""),
          });
          await supabaseAdmin
            .from("documents")
            .update({ pre_extraction_quality: quality })
            .eq("id", doc.id);
          if (quality.status === "manual_review_recommended") {
            console.log(
              `[extract/all] Document ${String(doc.id)} pre-extraction quality: manual_review_recommended`,
              quality.issues
            );
          }
        } catch (err) {
          console.error("[extract/all] pre-extraction quality failed:", err);
          quality = {
            status: "ok",
            issues: [],
            details: { analyzedAt: new Date().toISOString() },
          };
        }
        const extracted = await extractFieldsFromDocument({
          base64: b64,
          mimeType,
          docType: doc.doc_type,
          passportRouting,
        });

        const { error: delErr } = await supabaseAdmin
          .from("extracted_fields")
          .delete()
          .eq("application_id", application_id)
          .eq("source_doc_type", doc.doc_type);
        if (delErr) throw new Error(delErr.message);

        // is_flagged is never set from AI — team flags only via review UI.
        for (const [field_name, field_value] of Object.entries(extracted)) {
          const { error: insErr } = await supabaseAdmin
            .from("extracted_fields")
            .insert({
              application_id,
              field_name,
              field_value,
              source_doc_type: doc.doc_type,
              is_flagged: false,
              flag_note: "",
            });
          if (insErr) throw new Error(insErr.message);
          fieldsExtracted += 1;
        }

        await supabaseAdmin
          .from("documents")
          .update({ extraction_status: "done" })
          .eq("id", doc.id);
        docsProcessed += 1;
        document_results.push({
          document_id: String(doc.id),
          doc_type: String(doc.doc_type ?? ""),
          status: "extracted",
          quality,
        });
      } catch {
        await supabaseAdmin
          .from("documents")
          .update({ extraction_status: "failed" })
          .eq("id", doc.id);
        document_results.push({
          document_id: String(doc.id),
          doc_type: String(doc.doc_type ?? ""),
          status: "failed",
          ...(quality ? { quality } : {}),
        });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        docs_processed: docsProcessed,
        fields_extracted: fieldsExtracted,
        skipped_not_uploaded,
        document_results,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

