import { CLAUDE_EXTRACTION_KEY_INSTRUCTIONS } from "@/lib/form-fill-sections";
import type { Application, OciIntakeVariant } from "@/lib/types";

/** Keys produced or overlaid by MRZ parse + merge (see `lib/claude.ts`). */
export const MRZ_EXTRACTED_FIELD_KEYS = new Set([
  "last_name",
  "first_name",
  "passport_number",
  "nationality",
  "date_of_birth",
  "gender",
  "expiry_date",
  "passport_expiry_date",
]);

/** Universal passport identity concepts (MRZ + biodata synonyms). Both Indian and foreign profiles include these. */
export const PASSPORT_UNIVERSAL_CORE_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "surname",
  "given_name",
  "date_of_birth",
  "place_of_birth",
  "country_of_birth",
  "gender",
  "nationality",
  "passport_number",
  "passport_no",
  "passport_issue_date",
  "passport_expiry_date",
  "expiry_date",
  "passport_issue_place",
  "passport_issue_country",
  "place_of_issue",
  "country_of_issue",
] as const;

/** Shared beyond universal core: form-fill expects these from any passport biodata page. */
const PASSPORT_EXTENDED_FIELDS = [
  "middle_name",
  "current_nationality",
  "marital_status",
  "visible_identification_mark",
  "educational_qualification",
  "present_occupation",
  "spouse_name",
  "spouse_nationality",
  "spouse_date_of_birth",
  "address_line1",
  "address_line2",
  "address_line_1",
  "address_line_2",
  "address_city",
  "address_state",
  "address_country",
  "city",
  "state_province",
  "postal_code",
  "country",
  "phone",
  "email",
] as const;

const INDIAN_PASSPORT_EXTRA_FIELDS = [
  "former_indian_passport_number",
  "former_indian_passport_issue_date",
  "former_indian_passport_issue_place",
  "father_full_name",
  "mother_full_name",
] as const;

const FOREIGN_PASSPORT_TARGET_FIELDS = [
  ...PASSPORT_UNIVERSAL_CORE_FIELDS,
  ...PASSPORT_EXTENDED_FIELDS,
] as const;

const INDIAN_PASSPORT_TARGET_FIELDS = [
  ...PASSPORT_UNIVERSAL_CORE_FIELDS,
  ...PASSPORT_EXTENDED_FIELDS,
  ...INDIAN_PASSPORT_EXTRA_FIELDS,
] as const;

const FOREIGN_PASSPORT_INSTRUCTIONS = `
Passport biodata page only. Prefer printed labels over guesses.
place_of_birth: the city or town (or state if that is all that is printed) from the Place of birth / POB / lieu de naissance field — not the country name alone; put the country in country_of_birth when a separate field or clearly distinct.
For names: fill first_name AND given_name with the same given-name value; last_name AND surname with the same surname value; full_name as "Given … Surname" including any middle name in middle_name when shown.
For US-style Surname / Given names, map to last_name / first_name and full_name when you can combine reliably.
passport_issue_date, passport_issue_place, passport_issue_country (or place_of_issue / country_of_issue) are not in the MRZ — extract from the visual page when visible.
`.trim();

const INDIAN_PASSPORT_INSTRUCTIONS = `
${FOREIGN_PASSPORT_INSTRUCTIONS}

Indian passport layout: labels may be bilingual (English/Hindi). Surname and Given names appear as printed; map to last_name/surname and first_name/given_name with the same values in each pair; set full_name when you can combine reliably.
If a "File No." or observation/endorsement strip is visible on the biodata page, do not invent values — only output fields in the allowed key list when text clearly matches.

CRITICAL: An Indian passport has TWO different name sections:
1. BIODATA PAGE (photo page): Shows the applicant's own "Surname" and "Given Name(s)" in the top section. This is what must go into first_name, last_name, full_name.
2. PERSONAL PARTICULARS PAGE (last page): Shows "Name of Father/Legal Guardian", "Name of Mother", "Name of Spouse". These are FAMILY members, NOT the applicant.

Rules:
- first_name and last_name must ONLY come from the biodata page Surname/Given Name fields or the MRZ
- Do NOT use "Name of Father", "Name of Mother", or "Name of Spouse" values as first_name or last_name
- father_full_name, mother_full_name, and spouse_name are separate keys — output family names there only when printed on the personal particulars page
- If you are unsure which page a name is from, use the MRZ at the bottom of the biodata page as the source of truth
`.trim();

export type ExtractionProfileId =
  | "indian_passport_core"
  | "foreign_passport_core"
  | "birth_certificate_core"
  | "address_proof_core"
  | "oci_card_core"
  | "photo_signature_skip"
  | "general_fallback";

export type ExtractionProfile = {
  id: ExtractionProfileId;
  /** Requested JSON keys for this family; empty with general_fallback uses legacy instructions only. */
  targetFieldNames: readonly string[];
  /** Profile-specific extraction hints (concise). */
  instructions: string;
  /** Run MRZ transcription + parse before vision JSON. */
  preferMrzFirst: boolean;
  /** No Claude call; return {} from extractor. */
  skipAiExtraction: boolean;
};

export type PassportRoutingContext = {
  serviceType?: Application["service_type"] | null;
  ociIntakeVariant?: OciIntakeVariant | null;
};

/** Checklist doc_type values that use passport MRZ + profile routing. */
export const PASSPORT_DOC_TYPES = new Set([
  "current_passport",
  "former_indian_passport",
  "old_passport",
  "parent_passport_father",
  "parent_passport_mother",
  "parent_passport",
]);

export function resolvePassportProfileId(
  docType: string,
  ctx?: PassportRoutingContext
): "indian_passport_core" | "foreign_passport_core" {
  const dt = docType.trim();
  if (dt === "former_indian_passport") {
    if (ctx?.ociIntakeVariant === "new_foreign_birth") {
      return "foreign_passport_core";
    }
    return "indian_passport_core";
  }
  if (dt === "current_passport") {
    if (ctx?.serviceType === "passport_renewal") {
      return "indian_passport_core";
    }
    return "foreign_passport_core";
  }
  return "foreign_passport_core";
}

/** Aligned with family block + birth cert hints in `CLAUDE_EXTRACTION_KEY_INSTRUCTIONS` / SRC_FATHER_NAME, SRC_MOTHER_NAME. */
const BIRTH_CERT_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "full_name",
  "date_of_birth",
  "place_of_birth",
  "country_of_birth",
  "gender",
  "father_full_name",
  "mother_full_name",
  "father_date_of_birth",
  "mother_date_of_birth",
  "father_place_of_birth",
  "mother_place_of_birth",
  "father_nationality",
  "mother_nationality",
  "father_document_type",
  "mother_document_type",
  "father_indian_passport_number",
  "mother_indian_passport_number",
  "father_oci_number",
  "mother_oci_number",
  "address_at_birth",
  "permanent_address",
] as const;

const BIRTH_CERT_INSTRUCTIONS = `
Birth or registration certificate: names and dates as printed. Do not copy applicant fields from a different document.
`.trim();

/** Present + permanent blocks for `address_proof` in `OCI_FORM_FILL_BLOCKS`. */
const ADDRESS_PROOF_FIELDS = [
  "address_line_1",
  "address_line_2",
  "city",
  "state_province",
  "postal_code",
  "country",
  "phone",
  "email",
  "permanent_address_line_1",
  "permanent_address_line_2",
  "permanent_city",
  "permanent_state",
  "permanent_state_province",
  "permanent_country",
  "permanent_postal_code",
] as const;

const ADDRESS_PROOF_INSTRUCTIONS = `
Utility bill, lease, bank statement, or similar. ONLY address/contact fields above.
Do NOT output personal name keys (first_name, last_name, full_name, applicant_name, etc.).
Split one long line into address_line_1, city, state_province, postal_code, country when identifiable.
`.trim();

const OCI_CARD_FIELDS = [
  "full_name",
  "first_name",
  "last_name",
  "date_of_birth",
  "place_of_birth",
  "gender",
  "nationality",
  "oci_number",
  "oci_card_number",
  "uci_number",
  "passport_number",
  "date_of_issue",
  "place_of_issue",
  "date_of_expiry",
] as const;

const OCI_CARD_INSTRUCTIONS = `
OCI card: registration / UCI / OCI number as printed (oci_number or oci_card_number). Names and DOB as on the card.
`.trim();

const PROFILES: Record<ExtractionProfileId, ExtractionProfile> = {
  indian_passport_core: {
    id: "indian_passport_core",
    targetFieldNames: INDIAN_PASSPORT_TARGET_FIELDS,
    instructions: INDIAN_PASSPORT_INSTRUCTIONS,
    preferMrzFirst: true,
    skipAiExtraction: false,
  },
  foreign_passport_core: {
    id: "foreign_passport_core",
    targetFieldNames: FOREIGN_PASSPORT_TARGET_FIELDS,
    instructions: FOREIGN_PASSPORT_INSTRUCTIONS,
    preferMrzFirst: true,
    skipAiExtraction: false,
  },
  birth_certificate_core: {
    id: "birth_certificate_core",
    targetFieldNames: BIRTH_CERT_FIELDS,
    instructions: BIRTH_CERT_INSTRUCTIONS,
    preferMrzFirst: false,
    skipAiExtraction: false,
  },
  address_proof_core: {
    id: "address_proof_core",
    targetFieldNames: ADDRESS_PROOF_FIELDS,
    instructions: ADDRESS_PROOF_INSTRUCTIONS,
    preferMrzFirst: false,
    skipAiExtraction: false,
  },
  oci_card_core: {
    id: "oci_card_core",
    targetFieldNames: OCI_CARD_FIELDS,
    instructions: OCI_CARD_INSTRUCTIONS,
    preferMrzFirst: false,
    skipAiExtraction: false,
  },
  photo_signature_skip: {
    id: "photo_signature_skip",
    targetFieldNames: [],
    instructions: "",
    preferMrzFirst: false,
    skipAiExtraction: true,
  },
  general_fallback: {
    id: "general_fallback",
    targetFieldNames: [],
    instructions: "",
    preferMrzFirst: false,
    skipAiExtraction: false,
  },
};

/**
 * Explicit doc_type → profile for non-passport types. Passport doc_types use
 * `resolvePassportProfileId` via `getExtractionProfile`.
 * `parent_indian_doc` intentionally unmapped: legacy bucket may be passport or OCI — keep broad extraction.
 */
export const DOC_TYPE_TO_EXTRACTION_PROFILE: Record<
  string,
  ExtractionProfileId
> = {
  birth_certificate: "birth_certificate_core",
  address_proof: "address_proof_core",
  parent_address_proof: "address_proof_core",
  us_address_proof: "address_proof_core",
  indian_address_proof: "address_proof_core",
  applicant_oci_card: "oci_card_core",
  parent_oci: "oci_card_core",
  applicant_photo: "photo_signature_skip",
  applicant_signature: "photo_signature_skip",
  photo: "photo_signature_skip",
};

export function getExtractionProfile(
  docType: string,
  ctx?: PassportRoutingContext
): ExtractionProfile {
  const dt = docType.trim();
  if (PASSPORT_DOC_TYPES.has(dt)) {
    const id = resolvePassportProfileId(dt, ctx);
    return PROFILES[id];
  }
  const id = DOC_TYPE_TO_EXTRACTION_PROFILE[dt] ?? "general_fallback";
  return PROFILES[id];
}

/** Text appended to the user message (after shared header lines in claude.ts). */
export function buildProfileExtractionPromptAppendix(
  docType: string,
  profile: ExtractionProfile
): string {
  if (profile.id === "general_fallback") {
    return CLAUDE_EXTRACTION_KEY_INSTRUCTIONS;
  }

  const keys = profile.targetFieldNames.join(", ");
  return `
Extract data from this document. Document type key: ${docType}

Strict output rules:
- Return ONE JSON object; snake_case keys only.
- Include ONLY these keys (each value a string or null): ${keys}
- Set a value only when it is clearly printed on this document. If absent, illegible, or uncertain, use null.
- Do not infer, guess, or fill from context. Do not output keys outside the list above.

${profile.instructions}
`.trim();
}

function allowedKeysForProfile(profile: ExtractionProfile): Set<string> | null {
  if (profile.id === "general_fallback") return null;
  const s = new Set<string>(profile.targetFieldNames);
  if (profile.preferMrzFirst) {
    for (const k of MRZ_EXTRACTED_FIELD_KEYS) {
      s.add(k);
    }
  }
  return s;
}

/** Drops model noise; general_fallback returns input unchanged. */
export function filterExtractedByProfile(
  parsed: Record<string, string | null>,
  profile: ExtractionProfile
): Record<string, string | null> {
  const allowed = allowedKeysForProfile(profile);
  if (!allowed) return parsed;

  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (allowed.has(k)) {
      out[k] = v;
    }
  }
  return out;
}
