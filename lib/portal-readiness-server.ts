import "server-only";

import { getChecklistForServiceType } from "@/lib/application-checklist";
import {
  minorParentDocumentsMet,
  PARENT_DOCUMENT_CHECKLIST_ITEMS,
} from "@/lib/parent-documents";
import { ociParentRequirementMet } from "@/lib/oci-new-checklist";
import { getDriveFileMetadata, getFileAsBase64 } from "@/lib/google-drive";
import { validateGovtImage } from "@/lib/govt-photo-signature";
import { validatePassportRenewalPhoto } from "@/lib/passport-renewal-photo-validate";
import {
  allRequiredDocumentsUploaded,
  documentPdfReadyForPortal,
  isPortalPdfChecklistItem,
} from "@/lib/portal-readiness";
import type { PortalReadinessSnapshot } from "@/lib/portal-readiness";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Application } from "@/lib/types";

export async function getPortalReadinessSnapshot(
  applicationId: string
): Promise<PortalReadinessSnapshot> {
  const { data: appRow } = await supabaseAdmin
    .from("applications")
    .select("service_type, is_minor")
    .eq("id", applicationId)
    .maybeSingle();

  const is_minor = appRow?.is_minor === true;
  const checklist = getChecklistForServiceType(
    (appRow?.service_type as Application["service_type"] | undefined) ?? "oci_new"
  );
  const checklistForPortalPdfs = is_minor
    ? [...checklist, ...PARENT_DOCUMENT_CHECKLIST_ITEMS]
    : checklist;

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
  const required_docs_complete =
    allRequiredDocumentsUploaded(present, checklist) &&
    (!is_minor || minorParentDocumentsMet(present));
  const oci_parent_doc_for_submission = is_minor
    ? minorParentDocumentsMet(present)
    : ociParentRequirementMet(present);
  const uploaded_doc_types = [...present];

  let checklist_pdfs_ok = 0;
  let checklist_pdfs_uploaded = 0;
  let checklist_pdfs_ready = true;

  for (const item of checklistForPortalPdfs) {
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

  const serviceTypeEarly =
    (appRow?.service_type as Application["service_type"] | undefined) ??
    "oci_new";

  let applicant_photo_valid: boolean | null = null;
  const photoRow = byType.get("applicant_photo");
  if (photoRow?.drive_file_id) {
    try {
      const b64 = await getFileAsBase64(photoRow.drive_file_id);
      const buf = Buffer.from(b64, "base64");
      const v =
        serviceTypeEarly === "passport_renewal"
          ? await validatePassportRenewalPhoto(buf)
          : await validateGovtImage(buf, "photo");
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

  const serviceType = serviceTypeEarly;
  const isOciFlow =
    serviceType === "oci_new" || serviceType === "oci_renewal";
  const parentPortalGateOk = is_minor
    ? minorParentDocumentsMet(present)
    : isOciFlow
      ? ociParentRequirementMet(present)
      : true;

  const all_portal_green =
    required_docs_complete &&
    checklist_pdfs_ready &&
    applicant_photo_valid === true &&
    signatureOk &&
    parentPortalGateOk;

  return {
    required_docs_complete,
    oci_parent_doc_for_submission,
    uploaded_doc_types,
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
    oci_parent_doc_for_submission: false,
    uploaded_doc_types: [],
    checklist_pdfs_ready: false,
    checklist_pdfs_ok: 0,
    checklist_pdfs_uploaded: 0,
    applicant_photo_valid: null,
    applicant_signature_valid: null,
    all_portal_green: false,
  };
}
