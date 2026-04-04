const MRZ_OVERLAY_KEYS = new Set([
  "last_name",
  "first_name",
  "passport_number",
  "nationality",
  "date_of_birth",
  "gender",
  "expiry_date",
]);

const VISION_NAME_KEYS_TO_SCRUB = [
  "first_name",
  "last_name",
  "full_name",
  "given_name",
  "surname",
] as const;

function clearFutureDobIfLikelyExpiryTypo(
  out: Record<string, string | null>
): void {
  const raw = (out.date_of_birth ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return;
  const year = Number.parseInt(m[1], 10);
  const currentYear = new Date().getFullYear();
  if (year > currentYear + 1) {
    console.warn(
      `date_of_birth ${raw} is in the future — likely confused with expiry_date, clearing`
    );
    out.date_of_birth = null;
  }
}

/**
 * Keeps passport name keys consistent for review + form-fill: MRZ only emits
 * first_name/last_name; the model also outputs given_name/surname/full_name.
 * After MRZ overlay, align synonyms and fill full_name when missing.
 */
export function normalizePassportNameSynonyms(
  out: Record<string, string | null>
): void {
  let first = (out.first_name ?? "").trim();
  let last = (out.last_name ?? "").trim();
  const given = (out.given_name ?? "").trim();
  const sur = (out.surname ?? "").trim();

  if (!first && given) out.first_name = given;
  if (!last && sur) out.last_name = sur;

  first = (out.first_name ?? "").trim();
  last = (out.last_name ?? "").trim();
  if (first) out.given_name = first;
  if (last) out.surname = last;

  const mid = (out.middle_name ?? "").trim();
  first = (out.first_name ?? "").trim();
  last = (out.last_name ?? "").trim();
  if (!(out.full_name ?? "").trim() && first && last) {
    out.full_name = mid ? `${first} ${mid} ${last}` : `${first} ${last}`;
  }
}

export function mergeMrzOverVision(
  vision: Record<string, string | null>,
  mrz: Record<string, string> | null
): Record<string, string | null> {
  const out: Record<string, string | null> = { ...vision };
  if (!mrz) {
    normalizePassportNameSynonyms(out);
    clearFutureDobIfLikelyExpiryTypo(out);
    return out;
  }

  const visionDob = (vision.date_of_birth ?? "").trim();
  const mrzDob = (mrz.date_of_birth ?? "").trim();
  if (mrzDob && visionDob && mrzDob !== visionDob) {
    console.warn(
      `MRZ DOB overriding vision DOB: ${mrzDob} vs ${visionDob}`
    );
  }

  const mrzFn = (mrz.first_name ?? "").trim();
  const mrzLn = (mrz.last_name ?? "").trim();
  const mrzNameUsed = Boolean(mrzFn && mrzLn);

  if (!mrzNameUsed) {
    console.warn("MRZ name empty, falling back to vision — verify manually");
  }

  for (const k of VISION_NAME_KEYS_TO_SCRUB) {
    if (mrzNameUsed) {
      out[k] = null;
    }
  }

  for (const [k, v] of Object.entries(mrz)) {
    const t = v.trim();
    if (!t) continue;
    if (MRZ_OVERLAY_KEYS.has(k)) {
      out[k] = t;
    }
  }
  const exp = out.expiry_date?.trim();
  if (exp) {
    out.passport_expiry_date = exp;
  }
  normalizePassportNameSynonyms(out);
  clearFutureDobIfLikelyExpiryTypo(out);
  return out;
}
