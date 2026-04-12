import { CLAUDE_EXTRACTION_KEY_INSTRUCTIONS } from "@/lib/form-fill-sections";
import { ADDRESS_PROOF_FIELDS } from "@/lib/address-proof-fields";
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

/** Indian booklet-only fields (parent pages, former Indian passport, etc.). */
export const INDIAN_PASSPORT_EXTRA_FIELDS = [
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

/** Non-Indian passports (not US-specific layout). */
const FOREIGN_PASSPORT_INSTRUCTIONS = `
Passport biodata page only. Match values to their PRINTED FIELD LABELS — not by position on the page.

DATES AND PLACES (do not swap or merge):
- date_of_birth: ONLY from the field explicitly labeled for birth (e.g. "Date of birth", "D.O.B."). Never copy the issue date or expiry date here.
- passport_issue_date: from the issue / date of issue field only. It must be earlier than expiry.
- passport_expiry_date / expiry_date: from expiry / date of expiration only.
- place_of_birth + country_of_birth: ONLY from "Place of birth" (or equivalent). Never use the issuing office city, "place of issue", or visa page text.
- passport_issue_place / place_of_issue / country_of_issue: from issue / authority / place of issue fields — not from place of birth.

NAME RULES:
- last_name / surname: value next to "Surname", "Family name", or equivalent — typically one family token; do not put a patronymic or second given name into last_name unless the label groups it as surname.
- first_name / given_name: value next to "Given names", "Forenames", etc. If two given tokens appear under one label, first → first_name, second → middle_name.
- Fill first_name AND given_name consistently; last_name AND surname consistently.

If issue and expiry dates look reversed relative to each other, re-read the labels and correct before output.
`.trim();

/** US passport biodata (photo page). */
const US_PASSPORT_INSTRUCTIONS = `
US passport — photo / biodata page only. Every value must come from the label next to it.

DATES (never swap):
- date_of_birth: only from "Date of Birth" (or the birth line in the data block). Never use "Date of Issue" or "Date of Expiration".
- passport_issue_date: from "Date of Issue" / issuance date only.
- passport_expiry_date and expiry_date: from "Date of Expiration" / expiration only. Issue date is always before expiration.

PLACES (never swap):
- place_of_birth: city/state line from the labeled place-of-birth field — not the issuing authority location.
- country_of_birth: country shown for birth when printed separately; otherwise infer only if clearly labeled.
- passport_issue_place / place_of_issue / country_of_issue: from "Place of Issue", "Issuing authority", or the city shown as issuance — not place of birth.

NAMES (MRZ order is not visual reading order):
- On the printed card, "Surname" appears above "Given Names". Map Surname → last_name and surname; Given Names → first_name (and middle_name for an additional given token).
- WRONG: treating the first line of text in reading order as first_name. Always use the printed labels.
- WRONG: first_name="SHAH", last_name="AARIT HARSHAL". RIGHT: last_name="SHAH", first_name="AARIT", middle_name="HARSHAL" when Given Names show two tokens.
- Do not move a parent or spouse name into first_name or last_name.
`.trim();

const INDIAN_PASSPORT_INSTRUCTIONS = `
=== INDIAN PASSPORT — USE THE BIODATA PAGE FIRST ===
The biodata page shows the holder PHOTO and exactly two MRZ lines (A–Z, 0–9, <) at the bottom. It may be page 2 or the last page. Extract core identity from this page before other pages.

=== NAMES (labels only — never infer from order) ===
- "Surname" (English and/or Hindi) → last_name AND surname. Family name only — one short token (SHAH, PARIKH, KUMAR, PATEL). Never put the second half of "Given Names" into last_name.
- "Given Name(s)" / "Given Names" → first_name AND given_name. Two words under this label: FIRST word → first_name, SECOND → middle_name.
- WRONG: Given Name(s)="REEMABEN RAJESHBHAI", Surname="PARIKH" → last_name="RAJESHBHAI". NEVER.
- RIGHT: last_name="PARIKH", first_name="REEMABEN", middle_name="RAJESHBHAI".
- Do not copy father, mother, or spouse names into first_name or last_name. Indian states (e.g. GUJARAT, MAHARASHTRA) are never given names.

=== DATES (critical — do not swap) ===
- date_of_birth: ONLY from the field labeled "Date of Birth" / "जन्म तिथि". It must be a date many years before the issue date (passport holders are at least 1 year old). If the date you read for date_of_birth is the same year as the issue date or expiry date, you have read the wrong field — set date_of_birth to null.
- passport_issue_date: from issue / date of issue only. passport_expiry_date / expiry_date: from expiry only. Issue must precede expiry; if reversed, re-read labels.
- place_of_birth: only from "Place of Birth" — never from "Place of Issue" or "Domicile".
- passport_issue_place: from issue / authority fields — never from place of birth.

=== PERSONAL PARTICULARS PAGE ===
- "Name of Father" → father_full_name only. Never copy into first_name, last_name, or address fields.
- "Name of Mother" → mother_full_name only. Never copy into first_name, last_name, or address fields.
- "Name of Spouse" → spouse_name only.
- ADDRESS FIELDS (address_line1, address_line2, address_line_1, address_line_2, address_city, city, etc.): must contain a physical address — street number, road, locality, city, PIN code. If a line contains only a person's name (no street number or road), it is NOT an address line — set it to null. The "Name of Father/Mother" lines printed above the address block are NOT address content.

Bilingual labels: prefer the English label. File No. / observations: only output when clearly printed; do not invent.
`.trim();

export type ExtractionProfileId =
  | "indian_passport_core"
  | "us_passport_core"
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
): "indian_passport_core" | "us_passport_core" | "foreign_passport_core" {
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
    if (
      ctx?.serviceType === "oci_new" ||
      ctx?.serviceType === "oci_renewal" ||
      ctx?.serviceType === "passport_us_renewal_test"
    ) {
      return "us_passport_core";
    }
    return "foreign_passport_core";
  }
  if (
    dt === "parent_passport_father" ||
    dt === "parent_passport_mother" ||
    dt === "parent_passport"
  ) {
    return "indian_passport_core";
  }
  return "foreign_passport_core";
}

/** Aligned with family block keys in `CLAUDE_EXTRACTION_KEY_INSTRUCTIONS`; form fill parent rows use only parent passport/OCI/doc sources (not birth cert). */
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

const ADDRESS_PROOF_INSTRUCTIONS = `
Utility bill, lease, bank statement, or US state ID / driver's license used as proof of address.
ONLY the keys listed in the prompt (address/contact + optional ID lines below).

ADDRESS: Split a single printed address into address_line_1, address_line_2 (if present), city, state_province, postal_code, country when identifiable. Use permanent_* only when the document clearly shows a separate "permanent" / mailing / home address block; otherwise leave permanent_* null.

CONTACT: phone and email only when printed on the document.

STATE ID / DRIVER LICENSE (when the upload is an ID card or DL):
- id_document_number: the ID / DL / customer number as printed (not the barcode).
- id_issue_date / id_expiry_date: from labeled issue / expiration dates only.
- id_document_holder_name: the full name printed on the card (holder / name field). Do NOT copy this into first_name, last_name, or full_name — those keys are not in the allowed list.

Do NOT output personal name keys (first_name, last_name, full_name, applicant_name, etc.).
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
  us_passport_core: {
    id: "us_passport_core",
    targetFieldNames: FOREIGN_PASSPORT_TARGET_FIELDS,
    instructions: US_PASSPORT_INSTRUCTIONS,
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
  parent_oci_father: "oci_card_core",
  parent_oci_mother: "oci_card_core",
  employment_letter: "photo_signature_skip",
  us_status_proof: "photo_signature_skip",
  parental_authorization: "photo_signature_skip",
  marriage_affidavit: "photo_signature_skip",
  govt_application_form: "photo_signature_skip",
  annexure_e_signed: "photo_signature_skip",
  appearance_signature_affidavit_signed: "photo_signature_skip",
  vfs_payment_receipt: "photo_signature_skip",
  courier_label_receipt: "photo_signature_skip",
  spouse_name_change_proof: "photo_signature_skip",
  joint_photo_declaration: "photo_signature_skip",
  name_change_affidavit: "photo_signature_skip",
  name_change_newspaper_ads: "photo_signature_skip",
  parent_name_change_supporting_docs: "photo_signature_skip",
  birth_or_school_leaving_certificate: "photo_signature_skip",
  dob_change_proof: "photo_signature_skip",
  dob_change_court_order: "photo_signature_skip",
  supporting_docs: "photo_signature_skip",
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

  // Indian + US: layout-specific rules before the generic strict block so they are not diluted.
  if (
    profile.id === "indian_passport_core" ||
    profile.id === "us_passport_core"
  ) {
    return `
Extract data from this document. Document type key: ${docType}

${profile.instructions}

Strict output rules:
- Return ONE JSON object; snake_case keys only.
- Include ONLY these keys (each value a string or null): ${keys}
- Set a value only when it is clearly printed on this document. If absent, illegible, or uncertain, use null.
- Do not infer, guess, or fill from context. Do not output keys outside the list above.
`.trim();
  }

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
