import type { ExtractedField } from "@/lib/types";

/**
 * OCI portal–aligned copy-paste view. `keys` are tried in order; first non-empty value wins,
 * else first existing row (empty), else missing.
 */
export type FormFillFieldDef = {
  label: string;
  keys: string[];
};

/** Groups of JSON keys that mean the same thing from different models/docs. */
const EXTRACTED_KEY_SYNONYMS: readonly (readonly string[])[] = [
  ["first_name", "given_name", "forename", "given_names"],
  ["middle_name", "middle_names", "middle"],
  ["last_name", "surname", "family_name"],
  ["date_of_birth", "dob", "birth_date"],
  ["place_of_birth", "birth_place", "pob"],
  ["country_of_birth", "birth_country", "place_of_birth_country", "country_birth"],
  ["gender", "sex"],
  ["marital_status", "marital"],
  ["current_nationality", "nationality", "citizenship"],
  ["passport_number", "passport_no", "passport_num", "document_number"],
  ["passport_issue_date", "issue_date", "date_of_issue", "doi"],
  ["passport_expiry_date", "expiry_date", "date_of_expiry", "expiry", "doe"],
  ["place_of_issue", "issuing_authority", "issuing_office", "poi"],
  ["country_of_issue", "passport_country_of_issue", "issuing_country"],
  ["address_line_1", "address_line1", "address1", "line1", "street", "street_address", "residential_address"],
  ["address_line_2", "address_line2", "address2", "line2"],
  ["city", "city_name", "town", "district", "city_town"],
  ["state_province", "state", "province", "state_name", "region"],
  ["postal_code", "pin_code", "pincode", "zip", "zip_code", "postcode", "post_code", "pin"],
  ["country", "country_name", "residence_country"],
  ["father_full_name", "father_name", "fathers_name", "father"],
  ["mother_full_name", "mother_name", "mothers_name", "mother"],
  ["spouse_name", "spouse_full_name", "husband_name", "wife_name"],
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

function normalizeStoredFieldKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

/** All lookup aliases for one stored field_name from the DB. */
function aliasesForStoredName(fieldName: string): string[] {
  const n = normalizeStoredFieldKey(fieldName);
  const out = new Set<string>([fieldName.trim(), n]);
  for (const group of EXTRACTED_KEY_SYNONYMS) {
    if (group.some((g) => g === n)) {
      for (const g of group) out.add(g);
    }
  }
  return [...out];
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
- Personal: first_name, middle_name, last_name, date_of_birth, place_of_birth, country_of_birth, gender, marital_status, current_nationality
- Passport: passport_number, passport_issue_date, passport_expiry_date, place_of_issue, country_of_issue
- Address: address_line_1, address_line_2, city, state_province, postal_code (use pin_code style values for India), country
- Family: father_full_name, mother_full_name, spouse_name; previous_name if applicable
- Birth cert / native place: address_at_birth, permanent_address when useful for native place

When you see one long address line (e.g. street + city + PIN + state + country), split into address_line_1, city, state_province, postal_code, and country when the parts are identifiable (Indian PIN is often 6 digits; labels like PIN:, Gujarat, India help).
`.trim();

export type FormFillSectionDef = {
  title: string;
  fields: FormFillFieldDef[];
};

export const FORM_FILL_SECTIONS: FormFillSectionDef[] = [
  {
    title: "Personal Information",
    fields: [
      {
        label: "First Name",
        keys: ["first_name", "given_name", "forename", "full_name"],
      },
      { label: "Middle Name", keys: ["middle_name", "middle_names", "middle"] },
      { label: "Last Name", keys: ["last_name", "surname", "family_name"] },
      { label: "Date of Birth", keys: ["date_of_birth", "dob", "birth_date"] },
      { label: "Place of Birth", keys: ["place_of_birth", "birth_place", "pob"] },
      {
        label: "Country of Birth",
        keys: [
          "country_of_birth",
          "birth_country",
          "place_of_birth_country",
        ],
      },
      { label: "Gender", keys: ["gender", "sex"] },
      { label: "Marital Status", keys: ["marital_status", "marital"] },
      {
        label: "Current Nationality",
        keys: ["current_nationality", "nationality", "citizenship"],
      },
    ],
  },
  {
    title: "Passport Information",
    fields: [
      {
        label: "Passport Number",
        keys: ["passport_number", "passport_no", "document_number"],
      },
      {
        label: "Issue Date",
        keys: [
          "passport_issue_date",
          "date_of_issue",
          "issue_date",
          "doi",
        ],
      },
      {
        label: "Expiry Date",
        keys: [
          "passport_expiry_date",
          "passport_expiry",
          "date_of_expiry",
          "expiry_date",
          "expiry",
          "doe",
        ],
      },
      {
        label: "Place of Issue",
        keys: ["place_of_issue", "issuing_authority", "issuing_office", "poi"],
      },
      {
        label: "Country of Issue",
        keys: [
          "country_of_issue",
          "issuing_country",
          "passport_country_of_issue",
        ],
      },
    ],
  },
  {
    title: "Address",
    fields: [
      {
        label: "Address Line 1",
        keys: [
          "address_line_1",
          "address_line1",
          "address",
          "street",
          "street_address",
          "residential_address",
        ],
      },
      { label: "Address Line 2", keys: ["address_line_2", "address_line2", "line2"] },
      { label: "City", keys: ["city", "city_name", "town", "district"] },
      {
        label: "State / Province",
        keys: ["state_province", "state", "province", "state_name", "region"],
      },
      {
        label: "Postal Code",
        keys: [
          "postal_code",
          "zip",
          "pincode",
          "pin_code",
          "pin",
          "zip_code",
          "postcode",
        ],
      },
      { label: "Country", keys: ["country", "country_name", "residence_country"] },
    ],
  },
  {
    title: "Family Information",
    fields: [
      {
        label: "Father's Full Name",
        keys: ["father_full_name", "father_name", "fathers_name", "father"],
      },
      {
        label: "Mother's Full Name",
        keys: ["mother_full_name", "mother_name", "mothers_name", "mother"],
      },
      {
        label: "Spouse Name (if applicable)",
        keys: ["spouse_name", "spouse_full_name", "husband_name", "wife_name"],
      },
    ],
  },
];

export const FORM_FILL_ALL_FIELDS = FORM_FILL_SECTIONS.flatMap((s) => s.fields);

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
