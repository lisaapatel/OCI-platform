import Link from "next/link";
import { notFound } from "next/navigation";

import { applicationFromDbRow } from "@/lib/application-from-row";
import { coerceExtractionStatus } from "@/lib/document-utils";
import type { DocumentQualityResult } from "@/lib/document-quality-gate";
import type { Application, Document } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ApplicationDetailClient } from "./application-detail-client";

function mapDocuments(rows: Record<string, unknown>[]): Document[] {
  return rows.map((row) => ({
    id: String(row.id),
    application_id: String(row.application_id),
    doc_type: String(row.doc_type ?? ""),
    file_name: String(row.file_name ?? ""),
    drive_file_id: String(row.drive_file_id ?? ""),
    drive_view_url: String(row.drive_view_url ?? ""),
    extraction_status: coerceExtractionStatus(row.extraction_status),
    failure_reason:
      row.failure_reason == null || row.failure_reason === ""
        ? null
        : String(row.failure_reason),
    uploaded_at: String(row.uploaded_at ?? ""),
    compressed_drive_file_id:
      row.compressed_drive_file_id == null ||
      String(row.compressed_drive_file_id) === ""
        ? null
        : String(row.compressed_drive_file_id),
    compressed_drive_url:
      row.compressed_drive_url == null || String(row.compressed_drive_url) === ""
        ? null
        : String(row.compressed_drive_url),
    compressed_size_bytes:
      row.compressed_size_bytes == null || row.compressed_size_bytes === ""
        ? null
        : Number(row.compressed_size_bytes),
    fixed_drive_file_id:
      row.fixed_drive_file_id == null || String(row.fixed_drive_file_id) === ""
        ? null
        : String(row.fixed_drive_file_id),
    fixed_drive_url:
      row.fixed_drive_url == null || String(row.fixed_drive_url) === ""
        ? null
        : String(row.fixed_drive_url),
    fixed_size_bytes:
      row.fixed_size_bytes == null || row.fixed_size_bytes === ""
        ? null
        : Number(row.fixed_size_bytes),
    pre_extraction_quality:
      !("pre_extraction_quality" in row)
        ? undefined
        : row.pre_extraction_quality == null
          ? null
          : (row.pre_extraction_quality as DocumentQualityResult),
  }));
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: appRow, error: appError } = await supabaseAdmin
    .from("applications")
    .select("*")
    .eq("id", id)
    .single();

  if (appError || !appRow) {
    notFound();
  }

  const { data: docRows, error: docError } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("application_id", id)
    .order("uploaded_at", { ascending: false });

  if (docError) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-700">
          Failed to load documents: {docError.message}
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const application = applicationFromDbRow(appRow as Record<string, unknown>);
  const documents = mapDocuments(
    (docRows ?? []) as Record<string, unknown>[]
  );

  return (
    <ApplicationDetailClient
      application={application}
      initialDocuments={documents}
    />
  );
}
