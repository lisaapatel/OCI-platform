import type { ExtractedField } from "@/lib/types";

/**
 * OCI portal–aligned copy-paste view. `keys` are tried in order; first non-empty value wins,
 * else first existing row (empty), else missing.
 */
export type FormFillFieldDef = {
  label: string;
  keys: string[];
};

export type FormFillSectionDef = {
  title: string;
  fields: FormFillFieldDef[];
};

export const FORM_FILL_SECTIONS: FormFillSectionDef[] = [
  {
    title: "Personal Information",
    fields: [
      { label: "First Name", keys: ["first_name", "given_name", "full_name"] },
      { label: "Middle Name", keys: ["middle_name"] },
      { label: "Last Name", keys: ["last_name", "surname", "family_name"] },
      { label: "Date of Birth", keys: ["date_of_birth", "dob"] },
      { label: "Place of Birth", keys: ["place_of_birth"] },
      { label: "Country of Birth", keys: ["country_of_birth"] },
      { label: "Gender", keys: ["gender"] },
      { label: "Marital Status", keys: ["marital_status"] },
      { label: "Current Nationality", keys: ["current_nationality", "nationality"] },
    ],
  },
  {
    title: "Passport Information",
    fields: [
      { label: "Passport Number", keys: ["passport_number", "passport_no"] },
      { label: "Issue Date", keys: ["passport_issue_date", "date_of_issue", "issue_date"] },
      {
        label: "Expiry Date",
        keys: [
          "passport_expiry_date",
          "passport_expiry",
          "date_of_expiry",
          "expiry_date",
        ],
      },
      { label: "Place of Issue", keys: ["place_of_issue", "issuing_authority"] },
      { label: "Country of Issue", keys: ["country_of_issue", "issuing_country"] },
    ],
  },
  {
    title: "Address",
    fields: [
      { label: "Address Line 1", keys: ["address_line1", "address", "street"] },
      { label: "Address Line 2", keys: ["address_line2"] },
      { label: "City", keys: ["city"] },
      { label: "State / Province", keys: ["state_province", "state"] },
      { label: "Postal Code", keys: ["postal_code", "zip", "pincode", "pin_code"] },
      { label: "Country", keys: ["country"] },
    ],
  },
  {
    title: "Family Information",
    fields: [
      { label: "Father's Full Name", keys: ["father_full_name", "father_name"] },
      { label: "Mother's Full Name", keys: ["mother_full_name", "mother_name"] },
      { label: "Spouse Name (if applicable)", keys: ["spouse_name"] },
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
    const row = byName.get(k);
    if (!row) continue;
    const v = row.field_value != null ? String(row.field_value).trim() : "";
    if (v !== "") return { row, matchedKey: k };
    emptyRow ??= row;
  }
  if (emptyRow) return { row: emptyRow, matchedKey: def.keys[0] };
  return { row: undefined, matchedKey: def.keys[0] };
}
