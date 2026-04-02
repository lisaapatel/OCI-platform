import {
  OCI_NEW_CHECKLIST,
  shouldSkipAiExtraction,
  type ChecklistItem,
} from "@/lib/oci-new-checklist";
import { PORTAL_PDF_MAX_BYTES } from "@/lib/portal-constants";

/** Filled by `getPortalReadinessSnapshot` (server) for fill page / API consumers. */
export type PortalReadinessSnapshot = {
  required_docs_complete: boolean;
  checklist_pdfs_ready: boolean;
  checklist_pdfs_ok: number;
  checklist_pdfs_uploaded: number;
  applicant_photo_valid: boolean | null;
  applicant_signature_valid: boolean | null;
  all_portal_green: boolean;
};

export type PdfPortalRow = {
  size_bytes: number | null;
  compressed_size_bytes: number | null;
};

/** True if original or compressed PDF is within portal limit. */
export function documentPdfReadyForPortal(row: PdfPortalRow): boolean {
  if (row.size_bytes != null && row.size_bytes <= PORTAL_PDF_MAX_BYTES) {
    return true;
  }
  if (
    row.compressed_size_bytes != null &&
    row.compressed_size_bytes <= PORTAL_PDF_MAX_BYTES
  ) {
    return true;
  }
  return false;
}

/** Checklist items that are PDFs on the portal (not photo/signature JPEG). */
export function isPortalPdfChecklistItem(item: ChecklistItem): boolean {
  return !shouldSkipAiExtraction(item.doc_type);
}

export function allRequiredDocumentsUploaded(
  docTypesPresent: Set<string>,
  checklist: ChecklistItem[] = OCI_NEW_CHECKLIST
): boolean {
  for (const item of checklist) {
    if (!item.required) continue;
    if (!docTypesPresent.has(item.doc_type)) return false;
  }
  return true;
}

/**
 * Client-side: required checklist PDFs are uploaded and portal-prep marks each ready;
 * optional PDFs that are uploaded must also be ready.
 */
export function allUploadedChecklistPdfsPortalReady(
  documents: { id: string; doc_type: string }[],
  portalDocs: { id: string; ready_for_portal: boolean }[] | null | undefined,
  checklist: ChecklistItem[] = OCI_NEW_CHECKLIST
): boolean {
  if (!portalDocs?.length) return false;
  const portalById = new Map(portalDocs.map((p) => [p.id, p]));
  const docByType = new Map(documents.map((d) => [d.doc_type, d]));

  for (const item of checklist) {
    if (!isPortalPdfChecklistItem(item)) continue;
    const doc = docByType.get(item.doc_type);
    if (!doc) {
      if (item.required) return false;
      continue;
    }
    const p = portalById.get(doc.id);
    if (!p?.ready_for_portal) return false;
  }
  return true;
}
