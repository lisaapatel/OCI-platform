import {
  RECON_ATOMIC_RULES,
  synonymSetForAtomicRule,
  type ReconLogicalKey,
  type ReconLogicalKeyAtomic,
} from "@/lib/cross-doc-reconcile/config";

const COUNTRY_ABBREV: Record<string, string> = {
  "u.s.a": "usa",
  "u.s.": "usa",
  "u.s": "usa",
  "united states": "usa",
  "united states of america": "usa",
  "usa": "usa",
  "u.k.": "uk",
  uk: "uk",
  "united kingdom": "uk",
  india: "india",
  "ind.": "india",
};

/** Collapse whitespace, lowercase, strip outer punctuation for text fields. */
export function normalizeTextForCompare(input: string): string {
  let s = input.trim().toLowerCase().replace(/\s+/g, " ");
  s = s.replace(/[.,;:'"()[\]{}!]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  const mapped = COUNTRY_ABBREV[s];
  if (mapped) return mapped;
  return s;
}

/**
 * Try common date shapes → YYYY-MM-DD. Returns null if not confidently parseable.
 */
export function normalizeDateForCompare(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Already ISO
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY or MM/DD/YYYY (prefer DD/MM when first part > 12)
  const slash = raw.match(
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/,
  );
  if (slash) {
    let a = parseInt(slash[1], 10);
    let b = parseInt(slash[2], 10);
    let y = parseInt(slash[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      // ambiguous — assume DD/MM
      day = a;
      month = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }

  // Month name
  const months: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const mon = raw.match(
    /^(\d{1,2})[-\s]+([a-z]{3,9})[-\s]+(\d{2,4})$/i,
  );
  if (mon) {
    let day = parseInt(mon[1], 10);
    const mk = mon[2].toLowerCase().slice(0, 3);
    const month = months[mk];
    if (!month) return null;
    let y = parseInt(mon[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    const dd = String(day).padStart(2, "0");
    return `${y}-${month}-${dd}`;
  }

  return null;
}

/** Normalize field value for reconciliation (dates vs general text). */
export function normalizeFieldValue(
  raw: string,
  logicalKey: string,
): string {
  const t = raw.trim();
  if (!t) return "";
  if (logicalKey === "date_of_birth") {
    const d = normalizeDateForCompare(t);
    if (d) return d;
  }
  return normalizeTextForCompare(t);
}

/**
 * True when both doc types may participate in the same cross-doc reconciliation bucket for this logical key.
 */
export function rowsComparableForCrossDocReconciliation(
  docTypeA: string,
  docTypeB: string,
  logicalKey: ReconLogicalKey,
): boolean {
  if (docTypeA === docTypeB) return true;
  const rule = RECON_ATOMIC_RULES.find((r) => r.seed === logicalKey);
  if (!rule?.allowedDocTypes?.length) return false;
  const s = new Set<string>(rule.allowedDocTypes);
  return s.has(docTypeA) && s.has(docTypeB);
}

/**
 * Row matches an atomic seed's synonyms but its source_doc_type is not allowed for that seed — do not compare or flag with other docs.
 */
export function atomicFieldNonComparableForDocType(
  fieldKeyNormalized: string,
  sourceDocType: string,
  logicalKey: ReconLogicalKeyAtomic,
): boolean {
  const rule = RECON_ATOMIC_RULES.find((r) => r.seed === logicalKey);
  if (!rule?.allowedDocTypes?.length) return true;
  const syn = synonymSetForAtomicRule(rule);
  if (!syn.has(fieldKeyNormalized)) return false;
  return !new Set<string>(rule.allowedDocTypes).has(sourceDocType);
}
