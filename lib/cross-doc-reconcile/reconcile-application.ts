import {
  computeReconciliationUpdates,
  type ReconRow,
} from "@/lib/cross-doc-reconcile/compute-updates";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ExtractedField } from "@/lib/types";

/**
 * Loads extracted_fields for an application, runs cross-doc reconciliation, applies updates.
 * Errors are logged; callers should treat failures as non-fatal.
 */
export async function reconcileApplication(
  applicationId: string,
): Promise<{ ok: boolean; error?: string; fields?: ExtractedField[] }> {
  try {
    const { data: rows, error: selErr } = await supabaseAdmin
      .from("extracted_fields")
      .select(
        "id, application_id, field_name, field_value, source_doc_type, is_flagged, flag_note, reviewed_by, reviewed_at, updated_at",
      )
      .eq("application_id", applicationId);

    if (selErr) {
      console.error("reconcileApplication: select failed", selErr.message);
      return { ok: false, error: selErr.message };
    }

    const list = (rows ?? []) as ReconRow[];
    const { updates, skippedDueToAllowedDocTypes } =
      computeReconciliationUpdates(list);

    for (const s of skippedDueToAllowedDocTypes) {
      console.warn(
        `[reconcile] skipped cross-doc reconciliation for "${s.logicalKey}": ${s.count} extracted_field row(s) with source_doc_type="${s.sourceDocType}" (allowed: ${s.allowedDocTypes.join(", ")})`,
      );
    }

    for (const u of updates) {
      const { error: upErr } = await supabaseAdmin
        .from("extracted_fields")
        .update({
          is_flagged: u.is_flagged,
          flag_note: u.flag_note,
        })
        .eq("id", u.id)
        .eq("application_id", applicationId);
      if (upErr) {
        console.error("reconcileApplication: update failed", u.id, upErr.message);
        return { ok: false, error: upErr.message };
      }
    }

    const { data: fresh, error: reErr } = await supabaseAdmin
      .from("extracted_fields")
      .select("*")
      .eq("application_id", applicationId);

    if (reErr) {
      console.error("reconcileApplication: re-fetch failed", reErr.message);
      return { ok: true, fields: [] };
    }

    return { ok: true, fields: (fresh ?? []) as ExtractedField[] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("reconcileApplication: unexpected", msg);
    return { ok: false, error: msg };
  }
}
