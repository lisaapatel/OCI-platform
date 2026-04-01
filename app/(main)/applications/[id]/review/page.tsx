import Link from "next/link";
import { notFound } from "next/navigation";

import {
  dedupeExtractedFieldsLatest,
  type ExtractedFieldRow,
} from "@/lib/extracted-fields-dedupe";
import type { ExtractedField } from "@/lib/types";
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
    .select("id")
    .eq("id", id)
    .single();

  if (appErr || !app) notFound();

  const { data: docs } = await supabaseAdmin
    .from("documents")
    .select("id, doc_type, file_name, drive_view_url, drive_file_id")
    .eq("application_id", id)
    .order("uploaded_at", { ascending: false });

  const { data: fields } = await supabaseAdmin
    .from("extracted_fields")
    .select("*")
    .eq("application_id", id)
    .order("updated_at", { ascending: false });

  const documents = (docs ?? []).map((row) => ({
    id: String(row.id),
    doc_type: String(row.doc_type ?? ""),
    file_name: String(row.file_name ?? ""),
    drive_view_url: String(row.drive_view_url ?? ""),
    drive_file_id: String(row.drive_file_id ?? ""),
  }));

  const extracted = dedupeExtractedFieldsLatest(
    (fields ?? []) as ExtractedFieldRow[]
  );

  if (documents.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-[#64748b]">No uploaded documents to review.</p>
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
    <ReviewPageClient
      applicationId={id}
      documents={documents}
      initialFields={extracted}
    />
  );
}
