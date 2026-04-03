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
 * MRZ is the two lines of machine-readable text at the bottom of the passport photo page.
 * Tries consecutive 44-character TD3-style lines; uses autocorrect when supported.
 */
export function extractMRZ(text: string): Record<string, string> | null {
  try {
    const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const normalized = rawLines.map((l) => l.replace(/\s+/g, "").toUpperCase());
    const lines44 = normalized.filter((l) => /^[A-Z0-9<]{44}$/.test(l));
    if (lines44.length < 2) return null;

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
    return null;
  } catch {
    return null;
  }
}
