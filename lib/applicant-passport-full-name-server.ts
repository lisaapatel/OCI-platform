import "server-only";

import { resolvePassportFullName } from "@/lib/form-fill-sections";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ExtractedField } from "@/lib/types";

function fieldFromRow(row: Record<string, unknown>): ExtractedField {
  return {
    id: String(row.id),
    application_id: String(row.application_id),
    field_name: String(row.field_name ?? ""),
    field_value: String(row.field_value ?? ""),
    source_doc_type: String(row.source_doc_type ?? ""),
    is_flagged: row.is_flagged === true,
    flag_note: String(row.flag_note ?? ""),
    reviewed_by: String(row.reviewed_by ?? ""),
    reviewed_at: String(row.reviewed_at ?? ""),
    updated_at:
      row.updated_at == null || String(row.updated_at) === ""
        ? undefined
        : String(row.updated_at),
    created_at:
      row.created_at == null || String(row.created_at) === ""
        ? undefined
        : String(row.created_at),
  };
}

/**
 * Full name from **current passport** extraction (`resolvePassportFullName` /
 * form-fill locked sources). Matches the name shown on the govt form fill page,
 * not necessarily the dashboard `customer_name` from intake.
 */
export async function resolveApplicantFullNameForPortalPdfs(
  applicationId: string,
  fallbackCustomerName: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("extracted_fields")
    .select("*")
    .eq("application_id", applicationId);

  if (error || !data?.length) {
    return fallbackCustomerName.trim();
  }

  const fields = data.map((row) =>
    fieldFromRow(row as Record<string, unknown>),
  );
  const fromPassport = resolvePassportFullName(fields).value.trim();
  if (fromPassport) return fromPassport;
  return fallbackCustomerName.trim();
}
