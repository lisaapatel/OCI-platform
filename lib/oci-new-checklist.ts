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
];

export const OCI_NEW_REQUIRED_COUNT = OCI_NEW_CHECKLIST.filter((i) => i.required)
  .length;

const SKIP_AI_EXTRACTION_DOC_TYPES = new Set([
  "applicant_photo",
  "applicant_signature",
  "photo",
]);

/** Image-only uploads: no Claude extraction (would be sent as invalid PDF). */
export function shouldSkipAiExtraction(docType: unknown): boolean {
  return SKIP_AI_EXTRACTION_DOC_TYPES.has(String(docType ?? "").trim());
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
