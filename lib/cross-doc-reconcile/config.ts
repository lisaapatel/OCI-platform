import {
  EXTRACTED_KEY_SYNONYMS,
  normalizeStoredFieldKey,
} from "@/lib/form-fill-sections";

/** Atomic fields reconciled only across these doc types (never passport vs birth-cert numbers, etc.). */
export type ReconAtomicRule = {
  seed: ReconLogicalKeyAtomic;
  /** Normalized keys treated as this logical field for reconciliation. */
  synonyms: readonly string[];
  allowedDocTypes: readonly string[];
};

export type ReconLogicalKeyAtomic =
  | "date_of_birth"
  | "place_of_birth"
  | "current_nationality";

export type ReconLogicalKey = ReconLogicalKeyAtomic;

/** Never feed these keys into atomic reconciliation buckets (document identifiers). */
export const PASSPORT_NUMBER_FIELD_KEYS = new Set(
  ["passport_number", "passport_no", "passport_num", "document_number"].map(
    (k) => normalizeStoredFieldKey(k),
  ),
);

/** Identity / demographic fields that may legitimately appear on multiple uploaded documents. */
export const RECON_ATOMIC_RULES: readonly ReconAtomicRule[] = [
  {
    seed: "date_of_birth",
    synonyms: ["date_of_birth", "dob", "birth_date"],
    allowedDocTypes: [
      "current_passport",
      "old_passport",
      "former_indian_passport",
      "birth_certificate",
    ],
  },
  {
    seed: "place_of_birth",
    synonyms: [
      "place_of_birth",
      "birth_place",
      "birthplace",
      "city_of_birth",
      "town_of_birth",
      "pob",
      "place_of_birth_city",
    ],
    allowedDocTypes: ["current_passport", "birth_certificate"],
  },
  {
    seed: "current_nationality",
    synonyms: ["current_nationality", "nationality", "citizenship"],
    allowedDocTypes: ["current_passport"],
  },
] as const;

export function synonymSetForAtomicRule(rule: ReconAtomicRule): Set<string> {
  return new Set(rule.synonyms.map((k) => normalizeStoredFieldKey(k)));
}

function synonymSetForGroupContaining(canonical: string): Set<string> {
  const n = normalizeStoredFieldKey(canonical);
  for (const group of EXTRACTED_KEY_SYNONYMS) {
    if (group.some((g) => normalizeStoredFieldKey(g) === n)) {
      return new Set(group.map((g) => normalizeStoredFieldKey(g)));
    }
  }
  return new Set([n]);
}

/** Applicant name keys — never reconcile from address_proof (parent names on utility bills, etc.). */
const APPLICANT_NAME_GROUP_HEADS = [
  "first_name",
  "middle_name",
  "last_name",
  "full_name",
] as const;

function buildApplicantNameSynonymsForAddressProofExclusion(): Set<string> {
  const s = new Set<string>();
  for (const head of APPLICANT_NAME_GROUP_HEADS) {
    for (const x of synonymSetForGroupContaining(head)) s.add(x);
  }
  for (const x of ["name", "applicant_name", "child_name", "legal_name"]) {
    s.add(normalizeStoredFieldKey(x));
  }
  return s;
}

const ADDRESS_PROOF_APPLICANT_NAME_KEYS =
  buildApplicantNameSynonymsForAddressProofExclusion();

export function isAddressProofApplicantNameRow(row: {
  source_doc_type: string;
  field_name: string;
}): boolean {
  if (row.source_doc_type !== "address_proof") return false;
  return ADDRESS_PROOF_APPLICANT_NAME_KEYS.has(
    normalizeStoredFieldKey(row.field_name),
  );
}

export function allowedDocTypeSet(
  types: readonly string[],
): Set<string> {
  return new Set(types);
}
