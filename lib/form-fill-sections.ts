import type { ExtractedField } from "@/lib/types";

/**
 * OCI portal–aligned copy-paste view. `keys` are tried in order; first non-empty value wins,
 * else first existing row (empty), else missing.
 * When `sourceDocTypes` is set, only rows from those `source_doc_type` values are used (ordered preference).
 */
export type FormFillFieldDef = {
  label: string;
  keys: string[];
  /** Prefer first matching source_doc_type in this order. Omit = any source (legacy). */
  sourceDocTypes?: string[];
  optional?: boolean;
  tag?: string;
  /** Shown for team reference only — not written to portal as this field. */
  displayOnly?: boolean;
  /** Grey info line in form fill (no input/copy), not a portal field row. */
  referenceOnly?: boolean;
};

export type FormFillSectionBlock = {
  id: string;
  title: string;
  subtitle?: string;
  /** Shown when section is empty / collapsed hint */
  emptyHint?: string;
  collapsible?: boolean;
  defaultCollapsedWhenEmpty?: boolean;
  fields: FormFillFieldDef[];
};

/** Groups of JSON keys that mean the same thing from different models/docs. */
export const EXTRACTED_KEY_SYNONYMS: readonly (readonly string[])[] = [
  ["first_name", "given_name", "forename", "given_names"],
  ["middle_name", "middle_names", "middle"],
  [
    "last_name",
    "surname",
    "family_name",
    "passport_surname",
    "primary_surname",
    "surname_line",
    "holder_surname",
    "document_surname",
    "passport_holder_surname",
  ],
  ["full_name", "complete_name", "name_in_full", "applicant_full_name", "name", "applicant_name"],
  ["date_of_birth", "dob", "birth_date"],
  [
    "place_of_birth",
    "birth_place",
    "birthplace",
    "city_of_birth",
    "town_of_birth",
    "pob",
    "place_of_birth_city",
    "birth_city",
    "birth_town",
    "place_of_birth_town",
    "place_of_birth_locality",
    "place_of_birth_us",
    "us_place_of_birth",
    "birth_place_city",
    "pob_city",
    "born_in",
    "born_at",
    "birth_location",
    "place_born",
    "nativity",
    "native_place",
  ],
  ["country_of_birth", "birth_country", "place_of_birth_country", "country_birth"],
  ["gender", "sex"],
  ["marital_status", "marital"],
  ["religion"],
  ["visible_identification_mark", "visible_mark", "identification_mark"],
  ["educational_qualification", "education", "qualification", "highest_qualification"],
  ["present_occupation", "occupation", "current_occupation", "profession"],
  ["current_nationality", "nationality", "citizenship"],
  ["passport_number", "passport_no", "passport_num"],
  ["passport_issue_date", "issue_date", "date_of_issue", "doi"],
  ["passport_expiry_date", "expiry_date", "date_of_expiry", "expiry", "doe"],
  [
    "passport_issue_place",
    "place_of_issue",
    "issuing_authority",
    "issuing_office",
    "poi",
    "issuing_city",
    "issue_city",
    "passport_place_of_issue",
    "place_of_issue_city",
    "authority",
    "issuing_state",
    "issuance_location",
  ],
  [
    "passport_issue_country",
    "country_of_issue",
    "issuing_country",
    "passport_country_of_issue",
  ],
  [
    "former_indian_passport_number",
    "former_passport_number",
    "indian_passport_number",
  ],
  ["former_indian_passport_issue_date", "former_passport_issue_date"],
  ["former_indian_passport_issue_place", "former_passport_issue_place"],
  ["address_line_1", "address_line1", "address1", "line1", "street", "street_address", "residential_address"],
  ["address_line_2", "address_line2", "address2", "line2"],
  ["city", "city_name", "town", "district", "city_town"],
  ["state_province", "state", "province", "state_name", "region"],
  ["postal_code", "pin_code", "pincode", "zip", "zip_code", "postcode", "post_code", "pin"],
  ["country", "country_name", "residence_country"],
  ["phone", "mobile", "mobile_no", "phone_number", "contact_number"],
  ["email", "e_mail", "email_address"],
  [
    "permanent_address_line_1",
    "permanent_address_line1",
    "permanent_line1",
    "perm_address_line1",
  ],
  [
    "permanent_address_line_2",
    "permanent_address_line2",
    "permanent_line2",
  ],
  ["permanent_city", "perm_city"],
  ["permanent_state", "perm_state", "permanent_state_province"],
  ["permanent_country", "perm_country"],
  ["permanent_postal_code", "permanent_pin_code", "perm_postal_code"],
  ["father_full_name", "father_name", "fathers_name", "father"],
  ["father_date_of_birth", "father_dob"],
  ["father_place_of_birth", "father_pob"],
  ["father_nationality"],
  ["father_document_type"],
  ["father_indian_passport_number", "father_passport_number"],
  ["father_oci_number", "father_oci_card_number"],
  ["mother_full_name", "mother_name", "mothers_name", "mother"],
  ["mother_date_of_birth", "mother_dob"],
  ["mother_place_of_birth", "mother_pob"],
  ["mother_nationality"],
  ["mother_document_type"],
  ["mother_indian_passport_number", "mother_passport_number"],
  ["mother_oci_number", "mother_oci_card_number"],
  ["spouse_name", "spouse_full_name", "husband_name", "wife_name"],
  ["spouse_nationality"],
  ["spouse_date_of_birth", "spouse_dob"],
  [
    "previous_name",
    "maiden_name",
    "former_name",
    "name_changed_from",
  ],
  [
    "address_at_birth",
    "permanent_address",
    "native_place_address",
    "address_at_place_of_birth",
    "birth_address",
  ],
];

export function normalizeStoredFieldKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

/** All lookup aliases for one stored field_name from the DB. */
export function aliasesForStoredName(fieldName: string): string[] {
  const n = normalizeStoredFieldKey(fieldName);
  const out = new Set<string>([fieldName.trim(), n]);
  for (const group of EXTRACTED_KEY_SYNONYMS) {
    if (group.some((g) => g === n)) {
      for (const g of group) out.add(g);
    }
  }
  return [...out];
}

function fieldRowMatchesKeys(field: ExtractedField, keys: string[]): boolean {
  const nk = normalizeStoredFieldKey(field.field_name);
  for (const key of keys) {
    for (const alias of aliasesForStoredName(key)) {
      if (normalizeStoredFieldKey(alias) === nk) return true;
    }
  }
  return false;
}

/** First matching row: try each source_doc_type in order, then each field in `fields`. */
export function findRowByKeysAndSources(
  fields: ExtractedField[],
  keys: string[],
  sourceOrder: string[],
): ExtractedField | undefined {
  for (const src of sourceOrder) {
    for (const f of fields) {
      if (f.source_doc_type !== src) continue;
      if (fieldRowMatchesKeys(f, keys)) return f;
    }
  }
  return undefined;
}

export function getValueByKeysAndSources(
  fields: ExtractedField[],
  keys: string[],
  sourceOrder: string[],
): string {
  return findRowByKeysAndSources(fields, keys, sourceOrder)?.field_value?.trim() ?? "";
}

const PASSPORT_FIRST_NAME_KEYS = [
  "first_name",
  "given_name",
  "forename",
  "given_names",
] as const;
const PASSPORT_MIDDLE_NAME_KEYS = [
  "middle_name",
  "middle_names",
  "middle",
] as const;
const PASSPORT_LAST_NAME_KEYS = [
  "last_name",
  "surname",
  "family_name",
  "passport_surname",
  "primary_surname",
  "surname_line",
  "holder_surname",
  "document_surname",
  "passport_holder_surname",
] as const;

/**
 * Full name from current passport only: full_name, then name, then applicant_name (exact keys);
 * if any whole-name field omits a separate surname row, prefer composed first+middle+last.
 * Else concatenate first/given + middle + last/surname/… from current_passport only.
 */
export function resolvePassportFullName(fields: ExtractedField[]): {
  value: string;
  row?: ExtractedField;
  flagRows: ExtractedField[];
} {
  const pp = DOC_TYPE_CURRENT_PASSPORT;
  const passportRows = fields.filter((f) => f.source_doc_type === pp);

  const rowByExactKey = (key: string): ExtractedField | undefined => {
    const want = normalizeStoredFieldKey(key);
    return passportRows.find(
      (r) => normalizeStoredFieldKey(r.field_name) === want,
    );
  };

  const buildComposed = (): {
    value: string;
    row?: ExtractedField;
    flagRows: ExtractedField[];
  } => {
    const first = findRowByKeysAndSources(
      fields,
      [...PASSPORT_FIRST_NAME_KEYS],
      [pp],
    );
    const middle = findRowByKeysAndSources(
      fields,
      [...PASSPORT_MIDDLE_NAME_KEYS],
      [pp],
    );
    const last = findRowByKeysAndSources(
      fields,
      [...PASSPORT_LAST_NAME_KEYS],
      [pp],
    );
    const parts = [
      first?.field_value?.trim(),
      middle?.field_value?.trim(),
      last?.field_value?.trim(),
    ].filter(Boolean) as string[];
    const contributors = [first, middle, last].filter(
      (r): r is ExtractedField =>
        Boolean(r && String(r.field_value ?? "").trim()),
    );
    if (parts.length === 0) {
      return { value: "", row: undefined, flagRows: [] };
    }
    return {
      value: parts.join(" "),
      row: contributors[0],
      flagRows: contributors,
    };
  };

  const composed = buildComposed();
  const lastForHeuristic = findRowByKeysAndSources(
    fields,
    [...PASSPORT_LAST_NAME_KEYS],
    [pp],
  );
  const lastVal = lastForHeuristic?.field_value?.trim() ?? "";

  const preferComposedOver = (
    wholeRow: ExtractedField | undefined,
    wholeVal: string,
  ) => {
    if (!wholeVal || !composed.value.trim()) return false;
    if (!lastVal) return false;
    const w = wholeVal.toLowerCase();
    const l = lastVal.toLowerCase();
    if (w.includes(l)) return false;
    return composed.value.trim().length > wholeVal.trim().length;
  };

  const emitWholeOrComposed = (
    row: ExtractedField | undefined,
    val: string,
  ): { value: string; row?: ExtractedField; flagRows: ExtractedField[] } | null => {
    if (!val) return null;
    if (preferComposedOver(row, val)) {
      return {
        value: composed.value,
        row: composed.row ?? row,
        flagRows: composed.flagRows.length ? composed.flagRows : row ? [row] : [],
      };
    }
    return { value: val, row, flagRows: row ? [row] : [] };
  };

  const fullRow = rowByExactKey("full_name");
  const fromFull = emitWholeOrComposed(
    fullRow,
    fullRow?.field_value?.trim() ?? "",
  );
  if (fromFull) return fromFull;

  for (const key of ["name", "applicant_name"] as const) {
    const r = rowByExactKey(key);
    const out = emitWholeOrComposed(r, r?.field_value?.trim() ?? "");
    if (out) return out;
  }

  return composed;
}

/**
 * Map so form-fill can resolve `address_line_1` rows when defs ask for `address_line1`, etc.
 * If two rows compete for the same alias, prefer the one with a non-empty value.
 */
export function buildExtractedFieldLookupMap(
  rows: ExtractedField[]
): Map<string, ExtractedField> {
  const m = new Map<string, ExtractedField>();
  const preferSet = (key: string, row: ExtractedField) => {
    const k = key.trim().toLowerCase();
    if (!k) return;
    const existing = m.get(k);
    const v = (row.field_value ?? "").trim();
    const ev = existing ? String(existing.field_value ?? "").trim() : "";
    if (!existing || (ev === "" && v !== "")) m.set(k, row);
  };
  for (const f of rows) {
    for (const alias of aliasesForStoredName(f.field_name)) {
      preferSet(alias, f);
    }
  }

  const syntheticRow = (
    base: ExtractedField,
    fieldName: string,
    value: string
  ): ExtractedField => ({
    ...base,
    id: `${base.id}__derived_${fieldName}`,
    field_name: fieldName,
    field_value: value,
    is_flagged: false,
    flag_note: "",
  });

  const addrKeys = [
    "address_line_1",
    "address_line1",
    "address",
    "street",
    "street_address",
    "residential_address",
  ];
  let addrRow: ExtractedField | undefined;
  for (const key of addrKeys) {
    const r = m.get(key);
    if (r && String(r.field_value ?? "").trim()) {
      addrRow = r;
      break;
    }
  }

  if (addrRow) {
    const raw = String(addrRow.field_value ?? "");
    const hasPostal = [
      "postal_code",
      "pin_code",
      "pincode",
      "zip",
      "post_code",
    ].some((key) => (m.get(key)?.field_value ?? "").trim() !== "");

    if (!hasPostal) {
      const pinM = raw.match(/\bPIN\s*:?\s*(\d{6})\b/i);
      if (pinM) {
        const syn = syntheticRow(addrRow, "postal_code", pinM[1]);
        for (const k of [
          "postal_code",
          "pin_code",
          "pincode",
          "zip",
          "post_code",
          "pin",
        ]) {
          preferSet(k, syn);
        }
      }
    }

    const hasCity =
      (m.get("city")?.field_value ?? "").trim() !== "" ||
      (m.get("town")?.field_value ?? "").trim() !== "";
    if (!hasCity) {
      const cityM = raw.match(/,\s*([A-Za-z][A-Za-z\s]{2,40}?)\s+PIN\s*:/i);
      if (cityM) {
        const city = cityM[1].replace(/\s+/g, " ").trim();
        if (city.length >= 3) {
          const syn = syntheticRow(addrRow, "city", city);
          for (const k of ["city", "city_name", "town", "district"]) {
            preferSet(k, syn);
          }
        }
      }
    }
  }

  return m;
}

/** Appended to Claude extraction prompts so JSON keys match portal / form-fill. */
export const CLAUDE_EXTRACTION_KEY_INSTRUCTIONS = `
Use snake_case keys only. Prefer these exact names when the value exists (use null only when truly absent on the document):
- Personal: first_name, middle_name, last_name, full_name, date_of_birth, place_of_birth, country_of_birth, gender, marital_status, visible_identification_mark, educational_qualification, present_occupation, current_nationality
- Current foreign passport: passport_number, passport_issue_date, passport_expiry_date, passport_issue_place, passport_issue_country (or place_of_issue / country_of_issue)
- Former Indian passport (if this document is a former Indian passport): former_indian_passport_number, former_indian_passport_issue_date, former_indian_passport_issue_place
- Address proof (utility bill, lease, state ID / driver's license, etc.): ONLY address/contact fields plus optional ID metadata when the document is a government ID — address_line_1, address_line_2, city, state_province, postal_code, country, phone, email, permanent_* when a second address is printed, and id_document_number, id_issue_date, id_expiry_date, id_document_holder_name for DL/state ID. Do NOT output applicant passport-style name keys (first_name, last_name, full_name, name, applicant_name, etc.) from address proof; use id_document_holder_name for the name printed on the ID only.
- Address: address_line_1, address_line_2, city, state_province, postal_code, country, phone, email; permanent_* variants when a second address appears
- Family: father_full_name, father_date_of_birth, father_place_of_birth, father_nationality, father_indian_passport_number, father_oci_number; mirror for mother; spouse_name, spouse_nationality, spouse_date_of_birth when applicable
- Parent passport / parent_indian_doc: passport_number, passport_no, date_of_birth, place_of_birth, full_name (the parent's biodata on that upload only)
- Birth cert / native place: address_at_birth, permanent_address when useful

When you see one long address line, split into address_line_1, city, state_province, postal_code, and country when identifiable.
`.trim();

export const SRC_CURRENT_PASSPORT = ["current_passport"] as const;
export const SRC_BIRTH_THEN_PASSPORT = [
  "birth_certificate",
  "current_passport",
] as const;
export const SRC_PASSPORT_THEN_BIRTH = [
  "current_passport",
  "birth_certificate",
] as const;
/** Address fields: proof documents only (no current_passport — US passports lack address rows). */
export const SRC_ADDRESS_PROOF_ORDER = [
  "address_proof",
  "us_address_proof",
  "indian_address_proof",
] as const;

/** @deprecated Use SRC_ADDRESS_PROOF_ORDER — kept for older imports; no longer includes current_passport. */
export const SRC_ADDRESS_THEN_PASSPORT = [...SRC_ADDRESS_PROOF_ORDER];
export const SRC_FORMER_INDIAN = [
  "former_indian_passport",
  "old_passport",
] as const;
export const SRC_PARENT_PASSPORT_ONLY = [
  "parent_passport",
  "parent_indian_doc",
] as const;
/** Father passport number row: minor father slot first, then generic parent passport. */
export const SRC_FATHER_INDIAN_PASSPORT_NUMBER = [
  "parent_passport_father",
  "parent_passport",
  "parent_indian_doc",
  "parent_passport_mother",
] as const;
/** Mother passport number row: minor mother slot first. */
export const SRC_MOTHER_INDIAN_PASSPORT_NUMBER = [
  "parent_passport_mother",
  "parent_passport",
  "parent_indian_doc",
  "parent_passport_father",
] as const;
export const SRC_PARENT_OCI_ONLY = ["parent_oci"] as const;
export const SRC_FATHER_OCI_NUMBER = [
  "parent_oci_father",
  "parent_oci",
  "parent_oci_mother",
] as const;
export const SRC_MOTHER_OCI_NUMBER = [
  "parent_oci_mother",
  "parent_oci",
  "parent_oci_father",
] as const;
/**
 * Parent biodata in the family block (name, DOB, POB, nationality, doc reference):
 * **only** parent uploads — `parent_passport_*`, generic `parent_passport`,
 * `parent_indian_doc`, `parent_oci_*`. Birth certificate is not used here.
 */
export const SRC_FATHER_NAME = [
  "parent_passport_father",
  "parent_passport",
  "parent_indian_doc",
  "parent_oci_father",
  "parent_oci",
] as const;
export const SRC_MOTHER_NAME = [
  "parent_passport_mother",
  "parent_passport",
  "parent_indian_doc",
  "parent_oci_mother",
  "parent_oci",
] as const;

/** DB / checklist value; alias `passport_current` in policy docs maps here. */
export const DOC_TYPE_CURRENT_PASSPORT = "current_passport";

/**
 * Single allowed source — no fallback to other documents.
 * Keys are canonical synonym roots (see `canonicalSynonymKey`).
 */
export const LOCKED_SOURCE_FIELDS: Record<string, string> = {
  first_name: DOC_TYPE_CURRENT_PASSPORT,
  last_name: DOC_TYPE_CURRENT_PASSPORT,
  middle_name: DOC_TYPE_CURRENT_PASSPORT,
  full_name: DOC_TYPE_CURRENT_PASSPORT,
  passport_number: DOC_TYPE_CURRENT_PASSPORT,
  passport_issue_date: DOC_TYPE_CURRENT_PASSPORT,
  passport_expiry_date: DOC_TYPE_CURRENT_PASSPORT,
  passport_issue_place: DOC_TYPE_CURRENT_PASSPORT,
  passport_issue_country: DOC_TYPE_CURRENT_PASSPORT,
  nationality: DOC_TYPE_CURRENT_PASSPORT,
  current_nationality: DOC_TYPE_CURRENT_PASSPORT,
  place_of_birth: DOC_TYPE_CURRENT_PASSPORT,
};

/** Prefer first source; fall through if empty. */
export const SOURCE_PRIORITY_FIELDS: Record<string, readonly string[]> = {
  date_of_birth: [DOC_TYPE_CURRENT_PASSPORT, "birth_certificate"],
  gender: [DOC_TYPE_CURRENT_PASSPORT, "birth_certificate"],
};

export function canonicalSynonymKey(fieldName: string): string {
  const n = normalizeStoredFieldKey(fieldName);
  for (const group of EXTRACTED_KEY_SYNONYMS) {
    if (group.some((g) => normalizeStoredFieldKey(g) === n)) {
      return group[0];
    }
  }
  return n;
}

function mapPolicyDocType(dt: string): string {
  const t = dt.trim();
  if (t === "passport_current") return DOC_TYPE_CURRENT_PASSPORT;
  if (t === "passport_old") return "old_passport";
  return t;
}

export type FormFillSourceResolutionContext = {
  blockId: string;
  applicantIsMinor: boolean;
};

/**
 * Ordered `source_doc_type` list for this field. Empty = any (legacy).
 */
export function resolveFormFillSourceOrder(
  def: FormFillFieldDef,
  ctx: FormFillSourceResolutionContext,
): string[] {
  if (ctx.blockId === "present_address" && ctx.applicantIsMinor) {
    return [...SRC_ADDRESS_PROOF_ORDER];
  }
  if (ctx.blockId === "present_address" && !ctx.applicantIsMinor) {
    return [...SRC_ADDRESS_PROOF_ORDER];
  }

  if (ctx.blockId === "permanent_address") {
    return [...SRC_ADDRESS_PROOF_ORDER];
  }

  if (ctx.blockId === "renewal_present_address") {
    return [...SRC_RENEWAL_PRESENT_ADDRESS];
  }
  if (ctx.blockId === "renewal_indian_address") {
    return [...SRC_RENEWAL_INDIAN_ADDRESS];
  }

  const canon = canonicalSynonymKey(def.keys[0] ?? "");
  const locked = LOCKED_SOURCE_FIELDS[canon];
  if (locked) return [mapPolicyDocType(locked)];

  const priority = SOURCE_PRIORITY_FIELDS[canon];
  if (priority?.length) return [...priority].map(mapPolicyDocType);

  return def.sourceDocTypes?.length ? [...def.sourceDocTypes] : [];
}

export type FormFillSourceTag = {
  label: string;
  variant: "blue" | "grey" | "orange";
};

export function formFillSourceTagForRow(
  row: ExtractedField | undefined,
  ctx: FormFillSourceResolutionContext,
): FormFillSourceTag | undefined {
  if (!row) return undefined;
  const dt = row.source_doc_type;
  if (dt === DOC_TYPE_CURRENT_PASSPORT) {
    return { label: "Current Passport", variant: "blue" };
  }
  if (dt === "birth_certificate") {
    return { label: "Birth Certificate", variant: "grey" };
  }
  if (dt === "address_proof") {
    if (
      ctx.applicantIsMinor &&
      (ctx.blockId === "present_address" || ctx.blockId === "permanent_address")
    ) {
      return { label: "Address Proof (Parent)", variant: "orange" };
    }
    return { label: "Address Proof", variant: "grey" };
  }
  if (dt === "us_address_proof") {
    return { label: "US Address Proof", variant: "grey" };
  }
  if (dt === "indian_address_proof") {
    return { label: "Indian Address Proof", variant: "grey" };
  }
  if (dt === "parent_passport" || dt === "parent_indian_doc") {
    return { label: "Parent Passport", variant: "grey" };
  }
  if (dt === "parent_passport_father" || dt === "parent_passport_mother") {
    return { label: "Parent Passport", variant: "grey" };
  }
  if (dt === "parent_oci") {
    return { label: "Parent OCI", variant: "grey" };
  }
  if (dt === "parent_oci_father" || dt === "parent_oci_mother") {
    return { label: "Parent OCI", variant: "grey" };
  }
  if (dt === "former_indian_passport" || dt === "old_passport") {
    return { label: "Former Indian Passport", variant: "grey" };
  }
  return { label: dt.replace(/_/g, " "), variant: "grey" };
}

function f(
  label: string,
  keys: string[],
  sourceDocTypes?: readonly string[],
  extra?: Partial<Omit<FormFillFieldDef, "label" | "keys">>,
): FormFillFieldDef {
  return {
    label,
    keys,
    sourceDocTypes: sourceDocTypes ? [...sourceDocTypes] : undefined,
    ...extra,
  };
}

/** OCI-oriented blocks for the govt form fill page (order = render order after place-of-submission). */
export const OCI_FORM_FILL_BLOCKS: FormFillSectionBlock[] = [
  {
    id: "personal",
    title: "Personal Details",
    subtitle: "Applicant identity (foreign national on OCI)",
    fields: [
      f("Full name", ["full_name", "complete_name", "name_in_full"], [...SRC_CURRENT_PASSPORT]),
      f("Date of birth", ["date_of_birth", "dob", "birth_date"], [...SRC_PASSPORT_THEN_BIRTH], {
        tag: "Passport first, then birth certificate",
      }),
      f(
        "Place of birth",
        [
          "place_of_birth",
          "birth_place",
          "pob",
          "birthplace",
          "city_of_birth",
          "birth_city",
        ],
        [...SRC_CURRENT_PASSPORT],
        {
          tag: "Current passport only",
        },
      ),
      f("Gender", ["gender", "sex"], [...SRC_PASSPORT_THEN_BIRTH]),
      f("Marital status", ["marital_status", "marital"], [...SRC_PASSPORT_THEN_BIRTH]),
      f(
        "Visible identification mark",
        ["visible_identification_mark", "visible_mark"],
        [...SRC_PASSPORT_THEN_BIRTH]
      ),
      f(
        "Educational qualification",
        ["educational_qualification", "education", "qualification"],
        [...SRC_PASSPORT_THEN_BIRTH]
      ),
      f(
        "Present occupation",
        ["present_occupation", "occupation", "profession"],
        [...SRC_PASSPORT_THEN_BIRTH]
      ),
    ],
  },
  {
    id: "foreign_passport",
    title: "Current Passport (Foreign)",
    subtitle: "Applicant's current non-Indian passport",
    fields: [
      f("Passport number", ["passport_number", "passport_no"], [...SRC_CURRENT_PASSPORT]),
      f(
        "Passport issue date",
        ["passport_issue_date", "date_of_issue", "issue_date"],
        [...SRC_CURRENT_PASSPORT]
      ),
      f(
        "Passport expiry date",
        ["passport_expiry_date", "date_of_expiry", "expiry_date"],
        [...SRC_CURRENT_PASSPORT]
      ),
      f(
        "Passport issue place",
        [
          "passport_issue_place",
          "place_of_issue",
          "issuing_authority",
          "issuing_office",
          "issuing_city",
          "issue_city",
        ],
        [...SRC_CURRENT_PASSPORT]
      ),
      f(
        "Passport issue country",
        ["passport_issue_country", "country_of_issue", "issuing_country"],
        [...SRC_CURRENT_PASSPORT]
      ),
    ],
  },
  {
    id: "former_indian",
    title: "Former Indian Passport (if applicable)",
    emptyHint:
      "No former Indian passport found. Skip if applicant never held Indian citizenship.",
    collapsible: true,
    defaultCollapsedWhenEmpty: true,
    fields: [
      f(
        "Former Indian passport number",
        [
          "former_indian_passport_number",
          "former_passport_number",
          "passport_number",
          "passport_no",
        ],
        [...SRC_FORMER_INDIAN],
        { optional: true, tag: "If applicable" }
      ),
      f(
        "Former Indian passport issue date",
        ["former_indian_passport_issue_date", "former_passport_issue_date"],
        [...SRC_FORMER_INDIAN],
        { optional: true, tag: "If applicable" }
      ),
      f(
        "Former Indian passport issue place",
        ["former_indian_passport_issue_place", "former_passport_issue_place"],
        [...SRC_FORMER_INDIAN],
        { optional: true, tag: "If applicable" }
      ),
    ],
  },
  {
    id: "present_address",
    title: "Present Address",
    fields: [
      f(
        "Address line 1",
        ["address_line_1", "address_line1", "street", "street_address"],
        [...SRC_ADDRESS_PROOF_ORDER]
      ),
      f("Address line 2", ["address_line_2", "address_line2"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("City", ["city", "town"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("State / Province", ["state_province", "state", "province"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("Country", ["country", "country_name"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("Postal code", ["postal_code", "zip", "pin_code"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("Phone", ["phone", "mobile", "mobile_no"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("Email", ["email", "e_mail"], [...SRC_ADDRESS_PROOF_ORDER]),
    ],
  },
  {
    id: "permanent_address",
    title: "Permanent Address",
    subtitle: 'Use "Same as present address" when it matches',
    fields: [
      f(
        "Address line 1",
        ["permanent_address_line_1", "permanent_address_line1", "address_line_1"],
        [...SRC_ADDRESS_PROOF_ORDER]
      ),
      f(
        "Address line 2",
        ["permanent_address_line_2", "permanent_address_line2", "address_line_2"],
        [...SRC_ADDRESS_PROOF_ORDER]
      ),
      f("City", ["permanent_city", "city"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("State / Province", ["permanent_state", "state_province", "state"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("Country", ["permanent_country", "country"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("Postal code", ["permanent_postal_code", "postal_code", "pin_code"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("Phone", ["phone", "mobile"], [...SRC_ADDRESS_PROOF_ORDER]),
      f("Email", ["email"], [...SRC_ADDRESS_PROOF_ORDER]),
    ],
  },
  {
    id: "family",
    title: "Parent / Spouse Details",
    fields: [
      f("Father's name", ["father_full_name", "father_name", "father"], [...SRC_FATHER_NAME]),
      f("Father's date of birth", ["father_date_of_birth", "father_dob"], [...SRC_FATHER_NAME]),
      f("Father's place of birth", ["father_place_of_birth", "father_pob"], [...SRC_FATHER_NAME]),
      f("Father's nationality", ["father_nationality"], [...SRC_FATHER_NAME]),
      f(
        "Father — document type (reference)",
        ["father_document_type"],
        [...SRC_FATHER_NAME],
        { referenceOnly: true }
      ),
      f(
        "Father's Indian passport number",
        [
          "father_indian_passport_number",
          "father_passport_number",
          "passport_number",
          "passport_no",
          "document_number",
          "passport_id",
        ],
        [...SRC_FATHER_INDIAN_PASSPORT_NUMBER]
      ),
      f(
        "Father's OCI number",
        ["father_oci_number", "father_oci_card_number"],
        [...SRC_FATHER_OCI_NUMBER]
      ),
      f("Mother's name", ["mother_full_name", "mother_name", "mother"], [...SRC_MOTHER_NAME]),
      f("Mother's date of birth", ["mother_date_of_birth", "mother_dob"], [...SRC_MOTHER_NAME]),
      f("Mother's place of birth", ["mother_place_of_birth", "mother_pob"], [...SRC_MOTHER_NAME]),
      f("Mother's nationality", ["mother_nationality"], [...SRC_MOTHER_NAME]),
      f(
        "Mother — document type (reference)",
        ["mother_document_type"],
        [...SRC_MOTHER_NAME],
        { referenceOnly: true }
      ),
      f(
        "Mother's Indian passport number",
        [
          "mother_indian_passport_number",
          "mother_passport_number",
          "passport_number",
          "passport_no",
          "document_number",
          "passport_id",
        ],
        [...SRC_MOTHER_INDIAN_PASSPORT_NUMBER]
      ),
      f(
        "Mother's OCI number",
        ["mother_oci_number", "mother_oci_card_number"],
        [...SRC_MOTHER_OCI_NUMBER]
      ),
      f(
        "Spouse name",
        ["spouse_name", "spouse_full_name", "husband_name", "wife_name"],
        [...SRC_PASSPORT_THEN_BIRTH]
      ),
      f("Spouse nationality", ["spouse_nationality"], [...SRC_PASSPORT_THEN_BIRTH]),
      f("Spouse date of birth", ["spouse_date_of_birth", "spouse_dob"], [...SRC_PASSPORT_THEN_BIRTH]),
    ],
  },
];

/** Indian passport renewal (VFS) — portal-aligned sections; sources mostly `current_passport`, address from US/Indian proof. */
export const SRC_RENEWAL_PRESENT_ADDRESS = [
  "us_address_proof",
  "indian_address_proof",
] as const;
export const SRC_RENEWAL_INDIAN_ADDRESS = ["indian_address_proof"] as const;

export const PASSPORT_RENEWAL_FORM_FILL_BLOCKS: FormFillSectionBlock[] = [
  {
    id: "renewal_personal",
    title: "Personal Details",
    subtitle: "As on passport / application (VFS portal)",
    fields: [
      f("First name", ["first_name", "given_name", "forename"], [...SRC_CURRENT_PASSPORT]),
      f("Middle name", ["middle_name", "middle_names", "middle"], [...SRC_CURRENT_PASSPORT]),
      f("Last name", ["last_name", "surname", "family_name"], [...SRC_CURRENT_PASSPORT]),
      f("Full name", ["full_name", "complete_name", "name_in_full", "name"], [...SRC_CURRENT_PASSPORT]),
      f("Date of birth", ["date_of_birth", "dob", "birth_date"], [...SRC_PASSPORT_THEN_BIRTH]),
      f(
        "Place of birth",
        [
          "place_of_birth",
          "birth_place",
          "pob",
          "birthplace",
          "city_of_birth",
          "birth_city",
        ],
        [...SRC_CURRENT_PASSPORT]
      ),
      f("Country of birth", ["country_of_birth", "birth_country", "place_of_birth_country"], [...SRC_CURRENT_PASSPORT]),
      f("Gender", ["gender", "sex"], [...SRC_PASSPORT_THEN_BIRTH]),
      f("Marital status", ["marital_status", "marital"], [...SRC_PASSPORT_THEN_BIRTH]),
      f("Nationality", ["current_nationality", "nationality", "citizenship"], [...SRC_CURRENT_PASSPORT]),
      f(
        "Visible identification mark",
        ["visible_identification_mark", "visible_mark"],
        [...SRC_PASSPORT_THEN_BIRTH]
      ),
      f(
        "Educational qualification",
        ["educational_qualification", "education", "qualification"],
        [...SRC_PASSPORT_THEN_BIRTH]
      ),
      f(
        "Present occupation",
        ["present_occupation", "occupation", "profession"],
        [...SRC_PASSPORT_THEN_BIRTH]
      ),
    ],
  },
  {
    id: "renewal_passport",
    title: "Current Indian Passport",
    subtitle: "Booklet biodata / validity",
    fields: [
      f("Passport number", ["passport_number", "passport_no", "passport_num"], [...SRC_CURRENT_PASSPORT]),
      f(
        "Passport issue date",
        ["passport_issue_date", "issue_date", "date_of_issue", "doi"],
        [...SRC_CURRENT_PASSPORT]
      ),
      f(
        "Passport expiry date",
        ["passport_expiry_date", "expiry_date", "date_of_expiry", "doe"],
        [...SRC_CURRENT_PASSPORT]
      ),
      f(
        "Place of issue",
        [
          "passport_issue_place",
          "place_of_issue",
          "issuing_authority",
          "issuing_office",
          "issue_place",
        ],
        [...SRC_CURRENT_PASSPORT]
      ),
      f(
        "Country of issue",
        ["passport_issue_country", "country_of_issue", "issuing_country"],
        [...SRC_CURRENT_PASSPORT]
      ),
    ],
  },
  {
    id: "renewal_family",
    title: "Family",
    subtitle: "Father / mother / spouse (as printed in passport)",
    fields: [
      f("Father's full name", ["father_full_name", "father_name", "father"], [...SRC_CURRENT_PASSPORT]),
      f("Mother's full name", ["mother_full_name", "mother_name", "mother"], [...SRC_CURRENT_PASSPORT]),
      f(
        "Spouse name",
        ["spouse_name", "spouse_full_name", "husband_name", "wife_name"],
        [...SRC_PASSPORT_THEN_BIRTH]
      ),
    ],
  },
  {
    id: "renewal_present_address",
    title: "Present Address (USA)",
    subtitle: "From US address proof when uploaded; else Indian proof",
    fields: [
      f(
        "Address line 1",
        ["address_line_1", "address_line1", "street", "street_address"],
        [...SRC_RENEWAL_PRESENT_ADDRESS]
      ),
      f("Address line 2", ["address_line_2", "address_line2"], [...SRC_RENEWAL_PRESENT_ADDRESS]),
      f("City", ["city", "town"], [...SRC_RENEWAL_PRESENT_ADDRESS]),
      f("State / Province", ["state_province", "state", "province"], [...SRC_RENEWAL_PRESENT_ADDRESS]),
      f("Postal code", ["postal_code", "zip", "pin_code", "pincode"], [...SRC_RENEWAL_PRESENT_ADDRESS]),
      f("Country", ["country", "country_name"], [...SRC_RENEWAL_PRESENT_ADDRESS]),
      f("Phone", ["phone", "mobile", "mobile_no"], [...SRC_RENEWAL_PRESENT_ADDRESS]),
      f("Email", ["email", "e_mail"], [...SRC_RENEWAL_PRESENT_ADDRESS]),
    ],
  },
  {
    id: "renewal_indian_address",
    title: "Indian Address",
    subtitle: "If updating address in India — from Indian address proof",
    emptyHint: "Optional when applicant updates India address in passport.",
    fields: [
      f(
        "Address line 1",
        ["address_line_1", "address_line1", "street"],
        [...SRC_RENEWAL_INDIAN_ADDRESS]
      ),
      f("Address line 2", ["address_line_2", "address_line2"], [...SRC_RENEWAL_INDIAN_ADDRESS]),
      f("City", ["city", "town"], [...SRC_RENEWAL_INDIAN_ADDRESS]),
      f("State / Province", ["state_province", "state", "province"], [...SRC_RENEWAL_INDIAN_ADDRESS]),
      f("Postal code", ["postal_code", "pin_code", "pincode"], [...SRC_RENEWAL_INDIAN_ADDRESS]),
      f("Country", ["country", "country_name"], [...SRC_RENEWAL_INDIAN_ADDRESS]),
    ],
  },
];

/** Flat list of persistable fields (excludes displayOnly / referenceOnly) — used by tests / progress heuristics. */
export const FORM_FILL_ALL_FIELDS: FormFillFieldDef[] = OCI_FORM_FILL_BLOCKS.flatMap(
  (b) => b.fields.filter((fd) => !fd.displayOnly && !fd.referenceOnly)
);

/** Legacy export: single list shape for older callers. */
export type FormFillSectionDef = { title: string; fields: FormFillFieldDef[] };

export const FORM_FILL_SECTIONS: FormFillSectionDef[] = OCI_FORM_FILL_BLOCKS.map(
  (b) => ({ title: b.title, fields: b.fields })
);

export function resolveFormFillField(
  byName: Map<string, ExtractedField>,
  def: FormFillFieldDef
): { row?: ExtractedField; matchedKey: string } {
  let emptyRow: ExtractedField | undefined;
  for (const k of def.keys) {
    const row = byName.get(k) ?? byName.get(k.toLowerCase());
    if (!row) continue;
    const v = row.field_value != null ? String(row.field_value).trim() : "";
    if (v !== "") return { row, matchedKey: k };
    emptyRow ??= row;
  }
  if (emptyRow) return { row: emptyRow, matchedKey: def.keys[0] };
  return { row: undefined, matchedKey: def.keys[0] };
}
