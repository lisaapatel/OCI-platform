import { getExtractionProfile } from "@/lib/extraction-profiles";
import type { Application } from "@/lib/types";

export type ChecklistItem = {
  doc_type: string;
  label: string;
  required: boolean;
  optionalNote?: string;
};

/** Shown under the OCI document checklist on the application detail page. */
export const OCI_CHECKLIST_SUBMISSION_NOTE =
  "Upload either parent's Indian passport OR parent's OCI card — at least one is required before marking Ready to Submit.";

/** Stable keys stored in `documents.doc_type` for OCI New / OCI Renewal flows */
export const OCI_NEW_CHECKLIST: ChecklistItem[] = [
  { doc_type: "current_passport", label: "Current Passport", required: true },
  {
    doc_type: "former_indian_passport",
    label: "Applicant's Former Indian Passport (if any)",
    required: false,
    optionalNote: "Only if applicant previously held Indian citizenship",
  },
  { doc_type: "birth_certificate", label: "Birth Certificate", required: true },
  {
    doc_type: "address_proof",
    label: "Address Proof (Parent's — required for minors)",
    required: true,
    optionalNote:
      "For adult applicants, applicant's proof of address. For minors, parent's proof of address.",
  },
  { doc_type: "applicant_photo", label: "Applicant Photo", required: true },
  {
    doc_type: "applicant_signature",
    label: "Applicant Signature",
    required: false,
    optionalNote: "Govt portal (JPEG, 3:1 ratio)",
  },
  {
    doc_type: "parent_passport",
    label: "Parent's Indian Passport",
    required: false,
    optionalNote: "Upload if parent holds an Indian passport",
  },
  {
    doc_type: "parent_oci",
    label: "Parent's OCI Card",
    required: false,
    optionalNote: "Upload if parent holds an OCI card",
  },
  {
    doc_type: "marriage_certificate",
    label: "Marriage Certificate",
    required: false,
    optionalNote: "If applicable",
  },
  {
    doc_type: "marriage_affidavit",
    label: "Joint Affidavit of Subsisting Marriage (notarized)",
    required: false,
    optionalNote:
      "Required for spouse of foreign origin. Both spouses must sign (notarized original).",
  },
  {
    doc_type: "employment_letter",
    label: "Employment / Work Letter",
    required: false,
    optionalNote:
      "Letter from employer, self-employment proof, retirement proof, student admission letter, or written statement if never employed.",
  },
  {
    doc_type: "us_status_proof",
    label: "Proof of US Legal Status (non-US passport holders)",
    required: false,
    optionalNote:
      "Green Card (front & back), EAD, long-term US visa, or I-797 with expired visa. Required by consulate for non-US passport holders.",
  },
];

export const OCI_NEW_REQUIRED_COUNT = OCI_NEW_CHECKLIST.filter((i) => i.required)
  .length;

type SkipExtractionContext = {
  serviceType?: Application["service_type"] | null;
};

/** Image-only uploads: no Claude extraction (profile `photo_signature_skip`). */
export function shouldSkipAiExtraction(
  docType: unknown,
  ctx?: SkipExtractionContext
): boolean {
  const dt = String(docType ?? "").trim();
  // Passport renewal treats US status proof as extractable.
  if (dt === "us_status_proof" && ctx?.serviceType === "passport_renewal") {
    return false;
  }
  return getExtractionProfile(dt, {
    serviceType: ctx?.serviceType ?? null,
  }).skipAiExtraction;
}

export function getOciChecklistLabel(docType: string): string {
  const key = docType.trim();
  const hit = OCI_NEW_CHECKLIST.find((i) => i.doc_type === key);
  if (hit) return hit.label;
  if (key === "indian_citizenship_relinquishment")
    return "Indian Citizenship Relinquishment / Surrender";
  if (key === "applicant_oci_card")
    return "Applicant's OCI Card (existing)";
  if (key === "old_passport") return "Old/Previous Passport (legacy)";
  if (key === "parent_indian_doc")
    return "Parent's Indian Passport or OCI Card (legacy)";
  if (key === "parent_oci_father") return "Father's OCI Card";
  if (key === "parent_oci_mother") return "Mother's OCI Card";
  if (key === "employment_letter") return "Employment / Work Letter";
  if (key === "us_status_proof")
    return "Proof of US Legal Status (non-US passport holders)";
  if (key === "marriage_affidavit")
    return "Joint Affidavit of Subsisting Marriage (notarized)";
  if (key === "parental_authorization")
    return "Parental Authorization Form (notarized)";
  return docType;
}

/** At least one parent identity document (new or legacy bucket). */
export function ociParentRequirementMet(docTypesPresent: Set<string>): boolean {
  return (
    docTypesPresent.has("parent_passport") ||
    docTypesPresent.has("parent_oci") ||
    docTypesPresent.has("parent_indian_doc")
  );
}
