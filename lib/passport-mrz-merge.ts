// Names are excluded: Claude's MRZ transcription frequently hallucinates extra
// letters in surnames (e.g. SHAH→SHAIKH, PARIKH→PARIKHH). Vision extraction
// with explicit label-matching instructions is more reliable for names.
const MRZ_OVERLAY_KEYS = new Set([
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

const ADDRESS_LINE_KEYS = new Set([
  "address_line1",
  "address_line2",
  "address_line_1",
  "address_line_2",
]);

/**
 * Indian passport personal particulars pages print "Name of Father / Mother" directly
 * above the address block. Claude sometimes maps those name lines into address_line1/2.
 * A real address line always contains at least one digit (street number, PIN, flat no.).
 * If address_line1 or _2 has no digits, it's a person's name leaked in — clear it.
 */
function scrubNamesFromAddressLines(out: Record<string, string | null>): void {
  for (const key of ADDRESS_LINE_KEYS) {
    const val = (out[key] ?? "").trim();
    if (val && !/\d/.test(val)) {
      console.warn(`Clearing ${key} "${val}" — no digits, likely a person name not an address`);
      out[key] = null;
    }
  }
}

/** True when MRZ parse produced no usable field values (null, empty object, or all-empty values). */
export function isMrzDevoidOfParsedData(
  mrz: Record<string, string> | null
): boolean {
  if (mrz == null) return true;
  return !Object.values(mrz).some((v) => String(v ?? "").trim() !== "");
}

/** MRZ expiry can be corrupted when the scan is blurry; if it decodes to a past date, clear it. */
function clearPastExpiryIfLikelyMrzTypo(out: Record<string, string | null>): void {
  const raw = (out.expiry_date ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return;
  const year = Number.parseInt(m[1], 10);
  const currentYear = new Date().getFullYear();
  if (year < currentYear) {
    console.warn(`expiry_date ${raw} is in the past — likely MRZ read error, clearing`);
    out.expiry_date = null;
    if (out.passport_expiry_date === raw) out.passport_expiry_date = null;
  }
}

function clearFutureDobIfLikelyExpiryTypo(
  out: Record<string, string | null>,
  opts?: { visionOnly?: boolean }
): void {
  const raw = (out.date_of_birth ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return;
  const year = Number.parseInt(m[1], 10);
  const currentYear = new Date().getFullYear();
  if (year > currentYear + 1) {
    console.warn(
      opts?.visionOnly
        ? `Vision-only DOB ${raw} is in the future — likely expiry date, clearing`
        : `date_of_birth ${raw} is in the future — likely confused with expiry_date, clearing`
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
  if (isMrzDevoidOfParsedData(mrz)) {
    console.warn(
      "MRZ returned empty — using vision extraction only, no suppression applied"
    );
    const visionCopy = { ...vision };
    clearFutureDobIfLikelyExpiryTypo(visionCopy, { visionOnly: true });
    scrubNamesFromAddressLines(visionCopy);
    return visionCopy;
  }

  const m = mrz as Record<string, string>;
  const out: Record<string, string | null> = { ...vision };

  // Sanity check: if MRZ last_name disagrees significantly with vision last_name,
  // the MRZ was likely hallucinated (Claude inventing content for a blurry zone).
  // In that case skip all MRZ overrides to avoid corrupting correct vision data.
  const mrzLastName = (m.last_name ?? "").trim().toUpperCase();
  const visionLastName = (vision.last_name ?? "").trim().toUpperCase();
  if (mrzLastName && visionLastName && mrzLastName !== visionLastName) {
    console.warn(
      `MRZ last_name "${mrzLastName}" ≠ vision last_name "${visionLastName}" — MRZ appears hallucinated, skipping MRZ overrides except passport number when safe`
    );
    const visionCopy = { ...vision };
    clearFutureDobIfLikelyExpiryTypo(visionCopy, { visionOnly: true });
    const mrzPnRaw = (m.passport_number ?? "").trim();
    const mrzPnNorm = mrzPnRaw.replace(/\s/g, "").toUpperCase();
    const visPnRaw = (
      (vision.passport_number ?? vision.passport_no ?? "") as string
    ).trim();
    const visPnNorm = visPnRaw.replace(/\s/g, "").toUpperCase();
    if (mrzPnNorm && (!visPnNorm || visPnNorm === mrzPnNorm)) {
      visionCopy.passport_number = mrzPnRaw;
      visionCopy.passport_no = mrzPnRaw;
    }
    normalizePassportNameSynonyms(visionCopy);
    scrubNamesFromAddressLines(visionCopy);
    return visionCopy;
  }

  const visionDob = (vision.date_of_birth ?? "").trim();
  const mrzDob = (m.date_of_birth ?? "").trim();
  if (mrzDob && visionDob && mrzDob !== visionDob) {
    console.warn(
      `MRZ DOB overriding vision DOB: ${mrzDob} vs ${visionDob}`
    );
  }

  for (const [k, v] of Object.entries(m)) {
    const t = v.trim();
    if (!t) continue;
    if (!MRZ_OVERLAY_KEYS.has(k)) continue;

    // For expiry_date: only override if MRZ year is within 2 years of vision expiry year.
    // MRZ expiry is often corrupted on blurry scans (e.g. 2030 → 2039).
    if (k === "expiry_date") {
      const visionExpStr = (vision.expiry_date ?? vision.passport_expiry_date ?? "").trim();
      const mrzYear = /^(\d{4})/.exec(t)?.[1];
      const visionYear = /(\d{4})/.exec(visionExpStr)?.[1];
      if (mrzYear && visionYear && Math.abs(Number(mrzYear) - Number(visionYear)) > 2) {
        console.warn(`MRZ expiry year ${mrzYear} differs from vision expiry year ${visionYear} — skipping MRZ expiry override`);
        continue;
      }
    }

    // For date_of_birth: only override if MRZ DOB year is within 5 years of vision DOB year.
    // Blurry scans cause MRZ digit errors that shift the birth year significantly.
    if (k === "date_of_birth" && visionDob) {
      const mrzYear = /^(\d{4})/.exec(t)?.[1];
      const visionYear = /(\d{4})|(\d{2}\/\d{2}\/(\d{4}))/.exec(visionDob);
      const visionYearNum = visionYear?.[3] ? Number(visionYear[3]) : visionYear?.[1] ? Number(visionYear[1]) : null;
      if (mrzYear && visionYearNum && Math.abs(Number(mrzYear) - visionYearNum) > 5) {
        console.warn(`MRZ DOB year ${mrzYear} differs from vision DOB year ${visionYearNum} by >5 — skipping MRZ DOB override`);
        continue;
      }
    }

    out[k] = t;
  }
  const exp = out.expiry_date?.trim();
  if (exp) {
    out.passport_expiry_date = exp;
  }
  normalizePassportNameSynonyms(out);
  clearFutureDobIfLikelyExpiryTypo(out);
  clearPastExpiryIfLikelyMrzTypo(out);
  scrubNamesFromAddressLines(out);
  return out;
}
