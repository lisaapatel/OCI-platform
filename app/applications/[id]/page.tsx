import Link from "next/link";
import { notFound } from "next/navigation";

import type { Application, Document } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase";

import { ApplicationDetailClient } from "./application-detail-client";

function mapApplication(row: Record<string, unknown>): Application {
  return {
    id: String(row.id),
    app_number: String(row.app_number ?? ""),
    customer_name: String(row.customer_name ?? ""),
    customer_email: String(row.customer_email ?? ""),
    customer_phone: String(row.customer_phone ?? ""),
    service_type: row.service_type as Application["service_type"],
    status: row.status as Application["status"],
    drive_folder_id: String(row.drive_folder_id ?? ""),
    drive_folder_url: String(row.drive_folder_url ?? ""),
    notes: String(row.notes ?? ""),
    created_at: String(row.created_at ?? ""),
    created_by: String(row.created_by ?? ""),
  };
}

function mapDocuments(rows: Record<string, unknown>[]): Document[] {
  return rows.map((row) => ({
    id: String(row.id),
    application_id: String(row.application_id),
    doc_type: String(row.doc_type ?? ""),
    file_name: String(row.file_name ?? ""),
    drive_file_id: String(row.drive_file_id ?? ""),
    drive_view_url: String(row.drive_view_url ?? ""),
    extraction_status: row.extraction_status as Document["extraction_status"],
    uploaded_at: String(row.uploaded_at ?? ""),
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

  const application = mapApplication(appRow as Record<string, unknown>);
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
