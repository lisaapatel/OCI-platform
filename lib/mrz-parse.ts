import { parse } from "mrz";

function mrzYyMmDdToIso(raw: string | null | undefined, kind: "birth" | "expiry"): string {
  if (!raw || !/^\d{6}$/.test(raw)) return "";
  const yy = Number.parseInt(raw.slice(0, 2), 10);
  const mm = raw.slice(2, 4);
  const dd = raw.slice(4, 6);
  if (Number.isNaN(yy) || mm === "<<" || dd === "<<") return "";
  const month = Number.parseInt(mm, 10);
  const day = Number.parseInt(dd, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  const now = new Date();
  const currentYY = now.getFullYear() % 100;
  let fullYear: number;
  if (kind === "expiry") {
    fullYear = yy <= currentYY + 20 ? 2000 + yy : 1900 + yy;
  } else {
    fullYear = yy > currentYY ? 1900 + yy : 2000 + yy;
  }
  return `${String(fullYear).padStart(4, "0")}-${mm}-${dd}`;
}

function cleanMrzName(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/</g, " ").replace(/\s+/g, " ").trim();
}

function mrzFieldsUsable(fields: {
  documentNumber?: string | null;
  birthDate?: string | null;
  lastName?: string | null;
}): boolean {
  return Boolean(
    fields.documentNumber?.trim() &&
      fields.birthDate?.trim() &&
      fields.lastName?.trim()
  );
}

/**
 * Direct positional extraction from TD3 MRZ line pair — ignores check digits.
 * Used as fallback when the mrz library rejects lines due to LLM transcription errors
 * (e.g. Claude reads "<<" as "H<", corrupting check digits but leaving names intact).
 */
function extractFromMrzLinesDirect(
  line1: string,
  line2: string
): Record<string, string> | null {
  if (line1.length < 44 || line2.length < 44) return null;
  if (line1[0] !== "P") return null;

  // Positions 5–43: SURNAME<<GIVENNAMES<<<<<...
  const nameSection = line1.slice(5, 44);
  const sepIdx = nameSection.indexOf("<<");
  let surname = "";
  let givenNames = "";
  if (sepIdx >= 0) {
    surname = nameSection.slice(0, sepIdx).replace(/</g, " ").trim();
    givenNames = nameSection.slice(sepIdx + 2).replace(/</g, " ").trim();
  } else {
    // Single < fallback (rare, but handle gracefully)
    const sIdx = nameSection.indexOf("<");
    if (sIdx >= 0) {
      surname = nameSection.slice(0, sIdx).trim();
      givenNames = nameSection.slice(sIdx + 1).replace(/</g, " ").trim();
    } else {
      return null;
    }
  }

  const docNumber = line2.slice(0, 9).replace(/</g, "").trim();
  const nationality = line2.slice(10, 13).replace(/</g, "").trim();
  const birthRaw = line2.slice(13, 19);
  const sex = line2.slice(20, 21);
  const expiryRaw = line2.slice(21, 27);

  const out: Record<string, string> = {};
  if (surname) out.last_name = surname;
  if (givenNames) out.first_name = givenNames;
  if (docNumber) out.passport_number = docNumber;
  if (nationality) out.nationality = nationality;
  const dob = mrzYyMmDdToIso(birthRaw, "birth");
  if (dob) out.date_of_birth = dob;
  const expiry = mrzYyMmDdToIso(expiryRaw, "expiry");
  if (expiry) out.expiry_date = expiry;
  if (sex === "M" || sex === "F") out.gender = sex;

  return Object.keys(out).length >= 3 ? out : null;
}

/**
 * MRZ is the two lines of machine-readable text at the bottom of the passport photo page.
 * Tries consecutive 44-character TD3-style lines; uses autocorrect when supported.
 */
export function extractMRZ(text: string): Record<string, string> | null {
  try {
    const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const normalized = rawLines.map((l) => l.replace(/\s+/g, "").toUpperCase());
    // Collect 44-char MRZ lines; accept ±2 tolerance (Claude often produces 42–46 char lines)
    // and extract 44-char runs from longer lines that embed the MRZ inline.
    const lines44: string[] = [];
    for (const line of normalized) {
      if (/^[A-Z0-9<]{44}$/.test(line)) {
        lines44.push(line);
      } else if (/^[A-Z0-9<]{38,46}$/.test(line)) {
        lines44.push(line.slice(0, 44).padEnd(44, "<"));
      } else {
        const matches = line.match(/[A-Z0-9<]{38,}/g);
        if (matches) {
          for (const m of matches) lines44.push(m.slice(0, 44).padEnd(44, "<"));
        }
      }
    }
    console.log("[MRZ parse] lines44 found:", lines44.length, lines44.map(l => l.slice(0, 20) + "..."));
    if (lines44.length < 2) {
      console.log("[MRZ parse] not enough MRZ lines — raw input sample:", text.slice(0, 300));
      return null;
    }

    for (let i = 0; i + 1 < lines44.length; i++) {
      const pair = [lines44[i], lines44[i + 1]] as [string, string];
      let result: ReturnType<typeof parse>;
      try {
        result = parse(pair, { autocorrect: true });
      } catch {
        continue;
      }

      if (!result.valid && !mrzFieldsUsable(result.fields)) continue;

      const f = result.fields;
      const lastName = cleanMrzName(f.lastName);
      const firstName = cleanMrzName(f.firstName);
      const passportNumber = (f.documentNumber ?? "").replace(/</g, "").trim();
      const nationality = (f.nationality ?? "").replace(/</g, "").trim();
      const dateOfBirth = mrzYyMmDdToIso(f.birthDate ?? null, "birth");
      const expiryDate = mrzYyMmDdToIso(f.expirationDate ?? null, "expiry");
      const genderRaw = (f.sex ?? "").trim().toLowerCase();
      const gender =
        genderRaw === "male" || genderRaw === "m"
          ? "M"
          : genderRaw === "female" || genderRaw === "f"
            ? "F"
            : f.sex?.trim() ?? "";

      const out: Record<string, string> = {};
      if (lastName) out.last_name = lastName;
      if (firstName) out.first_name = firstName;
      if (passportNumber) out.passport_number = passportNumber;
      if (nationality) out.nationality = nationality;
      if (dateOfBirth) out.date_of_birth = dateOfBirth;
      if (gender) out.gender = gender;
      if (expiryDate) out.expiry_date = expiryDate;

      if (Object.keys(out).length === 0) continue;
      return out;
    }

    // mrz library rejected all pairs (e.g. Claude read "<<" as "H<", corrupting check digits).
    // Fall back to direct positional extraction on the first P< line pair.
    const p1 = lines44.find((l) => l.startsWith("P"));
    const p1Idx = p1 ? lines44.indexOf(p1) : -1;
    if (p1 && p1Idx >= 0 && p1Idx + 1 < lines44.length) {
      const direct = extractFromMrzLinesDirect(p1, lines44[p1Idx + 1]);
      if (direct) {
        console.log("[MRZ parse] used direct positional fallback:", JSON.stringify(direct));
        return direct;
      }
    }
    return null;
  } catch {
    return null;
  }
}
