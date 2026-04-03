import { format, isValid, parseISO } from "date-fns";
import { notFound } from "next/navigation";

import {
  dedupeExtractedFieldsLatest,
  type ExtractedFieldRow,
} from "@/lib/extracted-fields-dedupe";
import type { ExtractedField } from "@/lib/types";
import { normalizeStoredOciIntakeVariant } from "@/lib/oci-intake-variant";
import { getPortalReadinessSnapshot } from "@/lib/portal-readiness-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Application } from "@/lib/types";

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
    .select(
      "id, app_number, customer_name, customer_email, customer_phone, service_type, is_minor, oci_intake_variant"
    )
    .eq("id", id)
    .single();

  if (appErr || !app) notFound();

  const { data: fields } = await supabaseAdmin
    .from("extracted_fields")
    .select("*")
    .eq("application_id", id)
    .order("updated_at", { ascending: false });

  const extracted = dedupeExtractedFieldsLatest(
    (fields ?? []) as ExtractedFieldRow[]
  );

  let lastReviewedIso: string | null = null;
  for (const f of extracted) {
    const t = f.reviewed_at?.trim();
    if (t && (!lastReviewedIso || t > lastReviewedIso)) lastReviewedIso = t;
  }

  const portalReadiness = await getPortalReadinessSnapshot(id);

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
          .fill-govt-row {
            break-inside: avoid;
          }
        }
      `}</style>
      <FormFillPageClient
        applicationId={id}
        appNumber={String(app.app_number ?? "")}
        customerName={String(app.customer_name ?? "")}
        customerEmail={String(app.customer_email ?? "")}
        customerPhone={String(app.customer_phone ?? "")}
        serviceType={
          String(app.service_type ?? "oci_new") as Application["service_type"]
        }
        isMinor={app.is_minor === true}
        ociIntakeVariant={normalizeStoredOciIntakeVariant(
          app.oci_intake_variant
        )}
        lastReviewedLabel={formatReviewedAt(lastReviewedIso)}
        initialFields={extracted}
        portalReadiness={portalReadiness}
      />
    </>
  );
}
