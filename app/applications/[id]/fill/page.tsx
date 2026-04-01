import { format, isValid, parseISO } from "date-fns";
import { notFound } from "next/navigation";

import type { ExtractedField } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { FormFillPageClient } from "./form-fill-page-client";

function formatReviewedAt(iso: string | null): string {
  if (!iso?.trim()) return "—";
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, "MMM d, yyyy · h:mm a") : "—";
  } catch {
    return "—";
  }
}

export default async function FormFillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: app, error: appErr } = await supabaseAdmin
    .from("applications")
    .select("id, app_number, customer_name")
    .eq("id", id)
    .single();

  if (appErr || !app) notFound();

  const { data: fields } = await supabaseAdmin
    .from("extracted_fields")
    .select("*")
    .eq("application_id", id);

  const extracted = (fields ?? []) as ExtractedField[];

  let lastReviewedIso: string | null = null;
  for (const f of extracted) {
    const t = f.reviewed_at?.trim();
    if (t && (!lastReviewedIso || t > lastReviewedIso)) lastReviewedIso = t;
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          @page {
            margin: 14mm;
          }
          .fill-print-root {
            padding: 0 !important;
            gap: 0 !important;
            max-width: none !important;
          }
          .fill-print-summary {
            border: 1px solid #d4d4d4 !important;
            padding: 10px 12px !important;
            margin-bottom: 12px !important;
            break-inside: avoid;
          }
          .fill-print-section-title {
            break-after: avoid;
            margin-top: 14px !important;
            margin-bottom: 8px !important;
            font-size: 11pt !important;
          }
          .fill-field-card {
            break-inside: avoid;
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
            border-top: none !important;
            padding-top: 8px !important;
            padding-bottom: 8px !important;
            box-shadow: none !important;
          }
        }
      `}</style>
      <FormFillPageClient
        applicationId={id}
        appNumber={String(app.app_number ?? "")}
        customerName={String(app.customer_name ?? "")}
        lastReviewedLabel={formatReviewedAt(lastReviewedIso)}
        initialFields={extracted}
      />
    </>
  );
}
