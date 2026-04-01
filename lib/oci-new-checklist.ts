export type ChecklistItem = {
  doc_type: string;
  label: string;
  required: boolean;
  optionalNote?: string;
};

/** Stable keys stored in `documents.doc_type` for OCI New flow */
export const OCI_NEW_CHECKLIST: ChecklistItem[] = [
  { doc_type: "current_passport", label: "Current Passport", required: true },
  { doc_type: "old_passport", label: "Old/Previous Passport", required: true },
  { doc_type: "birth_certificate", label: "Birth Certificate", required: true },
  { doc_type: "address_proof", label: "Address Proof", required: true },
  { doc_type: "applicant_photo", label: "Applicant Photo", required: true },
  {
    doc_type: "parent_indian_doc",
    label: "Parent's Indian Passport or OCI Card",
    required: true,
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

const SKIP_AI_EXTRACTION_DOC_TYPES = new Set(["applicant_photo", "photo"]);

/** Image-only uploads: no Claude extraction (would be sent as invalid PDF). */
export function shouldSkipAiExtraction(docType: unknown): boolean {
  return SKIP_AI_EXTRACTION_DOC_TYPES.has(String(docType ?? "").trim());
}
