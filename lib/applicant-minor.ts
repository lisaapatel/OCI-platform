import { getValueByKeysAndSources } from "@/lib/form-fill-sections";
import type { ExtractedField } from "@/lib/types";

const DOB_KEYS = ["date_of_birth", "dob", "birth_date"] as const;
const DOB_SOURCES = ["current_passport", "birth_certificate"] as const;

/** Prefer passport, then birth certificate — suitable for age / minor checks only. */
function applicantDobRaw(
  fields: Pick<ExtractedField, "field_name" | "field_value" | "source_doc_type">[],
): string {
  return getValueByKeysAndSources(
    fields as ExtractedField[],
    [...DOB_KEYS],
    [...DOB_SOURCES],
  ).trim();
}

/**
 * Parse common DOB shapes to a UTC date at noon (avoids TZ edge cases for age).
 */
export function parseApplicantDob(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10) - 1;
    const d = parseInt(iso[3], 10);
    const dt = new Date(Date.UTC(y, m, d, 12, 0, 0));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const slash = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
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
      day = a;
      month = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const dt = new Date(Date.UTC(y, month - 1, day, 12, 0, 0));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

export function ageOnDateUtc(dob: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const m = asOf.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/** True when applicant is under 18 on `asOf` (uses DOB from passport, then birth certificate). */
export function applicantIsMinorFromFields(
  fields: Pick<ExtractedField, "field_name" | "field_value" | "source_doc_type">[],
  asOf: Date,
): boolean {
  const dob = parseApplicantDob(applicantDobRaw(fields));
  if (!dob) return false;
  return ageOnDateUtc(dob, asOf) < 18;
}
