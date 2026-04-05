import Link from "next/link";
import { notFound } from "next/navigation";

import {
  dedupeExtractedFieldsLatest,
  type ExtractedFieldRow,
} from "@/lib/extracted-fields-dedupe";
import {
  formatDocumentQualityHint,
  type DocumentQualityResult,
} from "@/lib/document-quality-gate";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ReviewPageClient } from "./review-page-client";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: app, error: appErr } = await supabaseAdmin
    .from("applications")
    .select("id, is_minor")
    .eq("id", id)
    .single();

  if (appErr || !app) notFound();

  const docColumnsFull =
    "id, doc_type, file_name, drive_view_url, drive_file_id, pre_extraction_quality";
  const docColumnsLegacy =
    "id, doc_type, file_name, drive_view_url, drive_file_id";

  const docsFull = await supabaseAdmin
    .from("documents")
    .select(docColumnsFull)
    .eq("application_id", id)
    .order("uploaded_at", { ascending: false });

  const msg = docsFull.error?.message ?? "";
  const missingQualityCol =
    docsFull.error != null &&
    /pre_extraction_quality|column .* does not exist/i.test(msg);

  const docsResult =
    missingQualityCol
      ? await supabaseAdmin
          .from("documents")
          .select(docColumnsLegacy)
          .eq("application_id", id)
          .order("uploaded_at", { ascending: false })
      : docsFull;

  if (docsResult.error) {
    return (
      <div className="p-6">
        <p className="text-sm font-medium text-red-800">
          Could not load documents
        </p>
        <p className="mt-2 text-sm text-[#64748b]">{docsResult.error.message}</p>
        <p className="mt-2 text-xs text-[#64748b]">
          If this mentions a missing column, run the latest Supabase migrations
          (e.g. documents.pre_extraction_quality).
        </p>
        <Link
          href={`/applications/${id}`}
          className="mt-4 inline-block text-sm font-medium text-[#2563eb] transition-colors duration-150 hover:text-blue-700"
        >
          Back to application
        </Link>
      </div>
    );
  }

  const docs = docsResult.data;

  const { data: fields, error: fieldsErr } = await supabaseAdmin
    .from("extracted_fields")
    .select("*")
    .eq("application_id", id)
    .order("updated_at", { ascending: false });

  const documents = (docs ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const pre_extraction_quality =
      r.pre_extraction_quality == null
        ? null
        : (r.pre_extraction_quality as DocumentQualityResult);
    const quality_hint =
      pre_extraction_quality && pre_extraction_quality.status !== "ok"
        ? formatDocumentQualityHint(pre_extraction_quality)
        : "";
    return {
      id: String(r.id),
      doc_type: String(r.doc_type ?? ""),
      file_name: String(r.file_name ?? ""),
      drive_view_url: String(r.drive_view_url ?? ""),
      drive_file_id: String(r.drive_file_id ?? ""),
      pre_extraction_quality,
      quality_hint,
    };
  });

  const extracted = dedupeExtractedFieldsLatest(
    (fields ?? []) as ExtractedFieldRow[]
  );

  if (documents.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-[#64748b]">No uploaded documents to review.</p>
        <p className="mt-2 text-xs text-[#64748b]">
          The review page only lists rows in the documents table for this
          application. Upload files from the application detail page first, then
          open Review again.
        </p>
        {fieldsErr ? (
          <p className="mt-2 text-xs text-amber-800">
            Could not load extracted fields: {fieldsErr.message}
          </p>
        ) : null}
        <Link
          href={`/applications/${id}`}
          className="mt-2 inline-block text-sm font-medium text-[#2563eb] transition-colors duration-150 hover:text-blue-700"
        >
          Back
        </Link>
      </div>
    );
  }

  return (
    <>
      {fieldsErr ? (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900">
          Could not load extracted fields: {fieldsErr.message}. Review may be
          incomplete until this is fixed.
        </div>
      ) : null}
      <ReviewPageClient
        applicationId={id}
        documents={documents}
        initialFields={extracted}
        isMinor={(app as Record<string, unknown>).is_minor === true}
      />
    </>
  );
}
