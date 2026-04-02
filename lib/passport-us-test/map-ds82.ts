import { normalizeStoredFieldKey } from "@/lib/form-fill-sections";

/** Map extracted DB rows to a flat snake_case key → value (first non-empty wins per key). */
export function extractedRowsToFieldMap(
  rows: { field_name: string; field_value: string | null }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = normalizeStoredFieldKey(r.field_name);
    const v = String(r.field_value ?? "").trim();
    if (v && out[k] === undefined) out[k] = v;
  }
  return out;
}

/**
 * Map canonical / synonym extracted keys to DS-82 AcroForm text field names.
 * Template must define matching field names (see templates/ds82.pdf POC).
 */
export function mapToDs82(fields: Record<string, string>): Record<string, string> {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const k = normalizeStoredFieldKey(key);
      const v = fields[k] ?? fields[key];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };

  return {
    FirstName: pick("first_name", "given_name", "forename", "given_names"),
    LastName: pick("last_name", "surname", "family_name"),
    DateOfBirth: pick("date_of_birth", "dob", "birth_date"),
    PassportNumber: pick(
      "passport_number",
      "passport_no",
      "passport_num",
      "document_number",
    ),
    PlaceOfBirth: pick("place_of_birth", "birth_place", "pob"),
  };
}
