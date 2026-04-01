import "server-only";

import { getDriveFileMetadata, getFileAsBase64 } from "@/lib/google-drive";
import { validateGovtImage } from "@/lib/govt-photo-signature";
import { OCI_NEW_CHECKLIST } from "@/lib/oci-new-checklist";
import {
  allRequiredDocumentsUploaded,
  documentPdfReadyForPortal,
  isPortalPdfChecklistItem,
} from "@/lib/portal-readiness";
import type { PortalReadinessSnapshot } from "@/lib/portal-readiness";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function getPortalReadinessSnapshot(
  applicationId: string
): Promise<PortalReadinessSnapshot> {
  const { data: rows, error } = await supabaseAdmin
    .from("documents")
    .select("doc_type, drive_file_id, compressed_size_bytes")
    .eq("application_id", applicationId);

  if (error) {
    return emptySnapshot();
  }

  const list = rows ?? [];
  const byType = new Map<
    string,
    {
      drive_file_id: string;
      compressed_size_bytes: number | null;
    }
  >();
  for (const r of list) {
    const dt = String(r.doc_type ?? "").trim();
    if (!dt) continue;
    byType.set(dt, {
      drive_file_id: String(r.drive_file_id ?? "").trim(),
      compressed_size_bytes:
        r.compressed_size_bytes != null && r.compressed_size_bytes !== ""
          ? Number(r.compressed_size_bytes)
          : null,
    });
  }

  const present = new Set(byType.keys());
  const required_docs_complete = allRequiredDocumentsUploaded(present);

  let checklist_pdfs_ok = 0;
  let checklist_pdfs_uploaded = 0;
  let checklist_pdfs_ready = true;

  for (const item of OCI_NEW_CHECKLIST) {
    if (!isPortalPdfChecklistItem(item)) continue;
    const row = byType.get(item.doc_type);
    if (!row?.drive_file_id) {
      if (item.required) checklist_pdfs_ready = false;
      continue;
    }
    checklist_pdfs_uploaded += 1;
    try {
      const meta = await getDriveFileMetadata(row.drive_file_id);
      const ready = documentPdfReadyForPortal({
        size_bytes: meta.size,
        compressed_size_bytes: row.compressed_size_bytes,
      });
      if (ready) checklist_pdfs_ok += 1;
      else checklist_pdfs_ready = false;
    } catch {
      checklist_pdfs_ready = false;
    }
  }

  let applicant_photo_valid: boolean | null = null;
  const photoRow = byType.get("applicant_photo");
  if (photoRow?.drive_file_id) {
    try {
      const b64 = await getFileAsBase64(photoRow.drive_file_id);
      const v = await validateGovtImage(Buffer.from(b64, "base64"), "photo");
      applicant_photo_valid = v.valid;
    } catch {
      applicant_photo_valid = false;
    }
  }

  let applicant_signature_valid: boolean | null = null;
  const sigRow = byType.get("applicant_signature");
  if (sigRow?.drive_file_id) {
    try {
      const b64 = await getFileAsBase64(sigRow.drive_file_id);
      const v = await validateGovtImage(
        Buffer.from(b64, "base64"),
        "signature"
      );
      applicant_signature_valid = v.valid;
    } catch {
      applicant_signature_valid = false;
    }
  }

  const signatureOk =
    !present.has("applicant_signature") ||
    applicant_signature_valid === true;

  const all_portal_green =
    required_docs_complete &&
    checklist_pdfs_ready &&
    applicant_photo_valid === true &&
    signatureOk;

  return {
    required_docs_complete,
    checklist_pdfs_ready,
    checklist_pdfs_ok,
    checklist_pdfs_uploaded,
    applicant_photo_valid,
    applicant_signature_valid,
    all_portal_green,
  };
}

function emptySnapshot(): PortalReadinessSnapshot {
  return {
    required_docs_complete: false,
    checklist_pdfs_ready: false,
    checklist_pdfs_ok: 0,
    checklist_pdfs_uploaded: 0,
    applicant_photo_valid: null,
    applicant_signature_valid: null,
    all_portal_green: false,
  };
}
