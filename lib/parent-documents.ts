import type { ChecklistItem } from "@/lib/oci-new-checklist";

/** Spec entries (shouldSkipAiExtraction is informational; AI uses oci-new-checklist skip set). */
export const PARENT_DOCUMENTS = [
  {
    doc_type: "parent_passport_father",
    label: "Father's Passport",
    note: "Passport (Indian or foreign, first and last page) or OCI card (front and back)",
    shouldSkipAiExtraction: false,
    required: true,
  },
  {
    doc_type: "parent_passport_mother",
    label: "Mother's Passport",
    note: "Passport (Indian or foreign, first and last page) or OCI card (front and back)",
    shouldSkipAiExtraction: false,
    required: false,
  },
  {
    doc_type: "parent_address_proof",
    label: "Parent's Address Proof",
    note: "Driver's license, utility bill, or lease — required for minor applicants",
    shouldSkipAiExtraction: false,
    required: true,
  },
] as const;

/** Shown above parent document slots on the application detail checklist. */
export const PARENT_PASSPORT_BANNER =
  "At least one parent's passport or OCI card (father or mother slot) is required.";

/**
 * Checklist rows for minors: father/mother `required: false` (at least one enforced
 * separately); parent address proof `required: true`.
 */
export const PARENT_DOCUMENT_CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    doc_type: "parent_passport_father",
    label: PARENT_DOCUMENTS[0].label,
    required: false,
    optionalNote: PARENT_DOCUMENTS[0].note,
  },
  {
    doc_type: "parent_passport_mother",
    label: PARENT_DOCUMENTS[1].label,
    required: false,
    optionalNote: PARENT_DOCUMENTS[1].note,
  },
  {
    doc_type: "parent_address_proof",
    label: PARENT_DOCUMENTS[2].label,
    required: true,
    optionalNote: PARENT_DOCUMENTS[2].note,
  },
];

export function minorParentPassportMet(docTypesPresent: Set<string>): boolean {
  return (
    docTypesPresent.has("parent_passport_father") ||
    docTypesPresent.has("parent_passport_mother")
  );
}

export function minorParentDocumentsMet(docTypesPresent: Set<string>): boolean {
  return (
    minorParentPassportMet(docTypesPresent) &&
    docTypesPresent.has("parent_address_proof")
  );
}
