import { EXTRACTED_KEY_SYNONYMS, normalizeStoredFieldKey } from "@/lib/form-fill-sections";

/** Logical reconciliation targets (extend by adding seeds). */
export const RECON_SEEDS = [
  "date_of_birth",
  "passport_number",
  "place_of_birth",
  "current_nationality",
] as const;

export type ReconLogicalKey =
  | (typeof RECON_SEEDS)[number]
  | "full_name";

export function synonymSetForSeed(seed: string): Set<string> {
  const n = normalizeStoredFieldKey(seed);
  for (const group of EXTRACTED_KEY_SYNONYMS) {
    if (group.some((g) => g === n)) return new Set(group);
  }
  return new Set([n]);
}

const FIRST_NAME_SYN = synonymSetForSeed("first_name");
const MIDDLE_NAME_SYN = synonymSetForSeed("middle_name");
const LAST_NAME_SYN = synonymSetForSeed("last_name");

export function getNamePartSynonyms(): {
  first: Set<string>;
  middle: Set<string>;
  last: Set<string>;
} {
  return {
    first: FIRST_NAME_SYN,
    middle: MIDDLE_NAME_SYN,
    last: LAST_NAME_SYN,
  };
}
