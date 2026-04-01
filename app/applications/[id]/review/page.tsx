import Link from "next/link";
import { notFound } from "next/navigation";

import type { ExtractedField } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase";

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
    .order("field_name");

  const documents = (docs ?? []).map((row) => ({
    id: String(row.id),
    doc_type: String(row.doc_type ?? ""),
    file_name: String(row.file_name ?? ""),
    drive_view_url: String(row.drive_view_url ?? ""),
    drive_file_id: String(row.drive_file_id ?? ""),
  }));

  const extracted = (fields ?? []) as ExtractedField[];

  if (documents.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-black/70">No uploaded documents to review.</p>
        <Link href={`/applications/${id}`} className="mt-2 inline-block text-sm underline">
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
