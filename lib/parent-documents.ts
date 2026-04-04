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
    docTypesPresent.has("parent_passport_mother") ||
    docTypesPresent.has("parent_oci_father") ||
    docTypesPresent.has("parent_oci_mother")
  );
}

export function minorParentDocumentsMet(docTypesPresent: Set<string>): boolean {
  return (
    minorParentPassportMet(docTypesPresent) &&
    docTypesPresent.has("parent_address_proof")
  );
}

/** Minor parent identity slots: passport vs OCI for the same parent. */
export const PARENT_MINOR_PASSPORT_DOC_TYPES = [
  "parent_passport_father",
  "parent_passport_mother",
] as const;
export const PARENT_MINOR_OCI_DOC_TYPES = [
  "parent_oci_father",
  "parent_oci_mother",
] as const;

const PASSPORT_TO_OCI_MINOR: Record<string, string> = {
  parent_passport_father: "parent_oci_father",
  parent_passport_mother: "parent_oci_mother",
};
const OCI_TO_PASSPORT_MINOR: Record<string, string> = {
  parent_oci_father: "parent_passport_father",
  parent_oci_mother: "parent_passport_mother",
};

export function minorParentOciCounterpart(passportDocType: string): string | null {
  return PASSPORT_TO_OCI_MINOR[passportDocType.trim()] ?? null;
}

export function minorParentPassportCounterpart(ociDocType: string): string | null {
  return OCI_TO_PASSPORT_MINOR[ociDocType.trim()] ?? null;
}

/** True if `fromType` → `toType` is an allowed minor parent slot passport/OCI swap. */
export function isMinorParentDocTypeTransition(
  fromType: string,
  toType: string
): boolean {
  const from = fromType.trim();
  const to = toType.trim();
  if (from === to) return false;
  return (
    PASSPORT_TO_OCI_MINOR[from] === to || OCI_TO_PASSPORT_MINOR[from] === to
  );
}

/** All `doc_type` values that share one physical upload slot (father or mother). */
export function allDocTypesInSameMinorParentSlot(docType: string): string[] {
  const t = docType.trim();
  if (t === "parent_passport_father" || t === "parent_oci_father") {
    return ["parent_passport_father", "parent_oci_father"];
  }
  if (t === "parent_passport_mother" || t === "parent_oci_mother") {
    return ["parent_passport_mother", "parent_oci_mother"];
  }
  return [t];
}

/** Resolve uploaded doc for checklist rows keyed as `parent_passport_father` / `mother`. */
export function findDocumentForMinorParentSlot<T extends { doc_type: string }>(
  checklistParentSlotDocType: string,
  byType: Map<string, T>
): T | undefined {
  for (const dt of allDocTypesInSameMinorParentSlot(checklistParentSlotDocType)) {
    const d = byType.get(dt);
    if (d) return d;
  }
  return undefined;
}

/** Map OCI minor-slot doc_type to checklist sort / row key (passport slot). */
export function minorParentSlotChecklistAlias(docType: string): string {
  const t = docType.trim();
  if (t === "parent_oci_father") return "parent_passport_father";
  if (t === "parent_oci_mother") return "parent_passport_mother";
  return t;
}

/** True if this document is already represented by a checklist row (avoids duplicate bulk rows). */
export function minorParentDocTypeCoveredByChecklist(
  docType: string,
  checklistDocTypes: Set<string>
): boolean {
  const t = docType.trim();
  if (checklistDocTypes.has(t)) return true;
  if (t === "parent_oci_father" && checklistDocTypes.has("parent_passport_father"))
    return true;
  if (t === "parent_oci_mother" && checklistDocTypes.has("parent_passport_mother"))
    return true;
  return false;
}
