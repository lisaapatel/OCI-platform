import { format, isValid, parseISO } from "date-fns";

import { FORM_FILL_ALL_FIELDS } from "@/lib/form-fill-sections";
import type { ExtractedField } from "@/lib/types";

/** Upper bound for progress (actual visible rows may be fewer when spouse / parent fields hidden). */
export const OCI_GOVT_FILL_FIELD_COUNT = FORM_FILL_ALL_FIELDS.length;

export function formatPortalDate(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  let d: Date | null = null;
  const isoTry = parseISO(t);
  if (isValid(isoTry)) d = isoTry;
  if (!d) {
    const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) {
      let y = Number(m[3]);
      if (y < 100) y += y >= 50 ? 1900 : 2000;
      const tryD = new Date(y, Number(m[2]) - 1, Number(m[1]));
      if (isValid(tryD)) d = tryD;
    }
  }
  if (d && isValid(d)) {
    const day = format(d, "dd");
    const mon = format(d, "MMM").toUpperCase();
    const yr = format(d, "yyyy");
    return `${day}/${mon}/${yr}`;
  }
  return t;
}

export function getRowByKeys(
  by: Map<string, ExtractedField>,
  keys: string[]
): ExtractedField | undefined {
  for (const k of keys) {
    const r = by.get(k) ?? by.get(k.toLowerCase());
    if (r) return r;
  }
  return undefined;
}

export function getValueByKeys(
  by: Map<string, ExtractedField>,
  keys: string[]
): string {
  for (const k of keys) {
    const r = by.get(k) ?? by.get(k.toLowerCase());
    const v = r?.field_value?.trim();
    if (v) return v;
  }
  return "";
}

export function collectFlagMeta(
  rows: (ExtractedField | undefined)[]
): { flagged: boolean; notes: string[] } {
  const notes: string[] = [];
  let flagged = false;
  for (const r of rows) {
    if (r?.is_flagged) {
      flagged = true;
      const n = r.flag_note?.trim();
      if (n) notes.push(n);
    }
  }
  return { flagged, notes };
}

const LAST = ["last_name", "surname", "family_name"];
const FIRST = ["first_name", "given_name", "forename"];
const MIDDLE = ["middle_name", "middle_names", "middle"];

export function buildGivenName(by: Map<string, ExtractedField>): {
  text: string;
  rows: ExtractedField[];
} {
  const f = getValueByKeys(by, FIRST);
  const m = getValueByKeys(by, MIDDLE);
  const parts = [f, m].filter(Boolean);
  const text = parts.join(" ").trim();
  const rows = [getRowByKeys(by, FIRST), getRowByKeys(by, MIDDLE)].filter(
    Boolean
  ) as ExtractedField[];
  return { text, rows };
}

export function buildPresentAddress(by: Map<string, ExtractedField>): {
  text: string;
  rows: ExtractedField[];
} {
  const line1 = getValueByKeys(by, [
    "address_line_1",
    "address_line1",
    "address",
    "street",
    "street_address",
    "residential_address",
  ]);
  const line2 = getValueByKeys(by, ["address_line_2", "address_line2"]);
  const city = getValueByKeys(by, ["city", "city_name", "town", "district"]);
  const state = getValueByKeys(by, [
    "state_province",
    "state",
    "province",
    "state_name",
  ]);
  const postal = getValueByKeys(by, [
    "postal_code",
    "pin_code",
    "pincode",
    "zip",
    "post_code",
    "pin",
  ]);
  const country = getValueByKeys(by, ["country", "country_name", "residence_country"]);
  const segments = [line1, line2, city, state, postal, country].filter(Boolean);
  const text = segments.join(", ");
  const rowKeys = [
    "address_line_1",
    "address_line1",
    "address",
    "city",
    "state_province",
    "state",
    "postal_code",
    "pin_code",
    "country",
  ];
  const rows: ExtractedField[] = [];
  const seen = new Set<string>();
  for (const k of rowKeys) {
    const r = getRowByKeys(by, [k]);
    if (r && !seen.has(r.id)) {
      seen.add(r.id);
      rows.push(r);
    }
  }
  return { text, rows };
}

const NATIVE_KEYS = [
  "address_at_birth",
  "permanent_address",
  "native_place_address",
  "address_at_place_of_birth",
  "birth_address",
];

export function buildNativePlace(by: Map<string, ExtractedField>): {
  text: string;
  rows: ExtractedField[];
} {
  let text = getValueByKeys(by, NATIVE_KEYS);
  const rows: ExtractedField[] = [];
  for (const k of NATIVE_KEYS) {
    const r = getRowByKeys(by, [k]);
    if (r && !rows.some((x) => x.id === r.id)) rows.push(r);
  }
  if (!text) {
    text = getValueByKeys(by, ["place_of_birth", "birth_place"]);
    const pob = getRowByKeys(by, ["place_of_birth", "birth_place"]);
    if (pob && !rows.some((x) => x.id === pob.id)) rows.push(pob);
  }
  return { text, rows };
}

const PREVIOUS_NAME_KEYS = [
  "previous_name",
  "maiden_name",
  "former_name",
  "name_changed_from",
];

export function buildPreviousName(by: Map<string, ExtractedField>): {
  text: string;
  rows: ExtractedField[];
} {
  const text = getValueByKeys(by, PREVIOUS_NAME_KEYS);
  const r = getRowByKeys(by, PREVIOUS_NAME_KEYS);
  return {
    text: text || "N/A - check with customer",
    rows: r ? [r] : [],
  };
}
