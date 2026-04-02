/**
 * True when spouse name is empty or explicitly marked N/A (case-insensitive variants).
 */
export function isSpouseNameNa(raw: string | null | undefined): boolean {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!t) return true;
  if (t === "n/a" || t === "na" || t === "n a") return true;
  if (t === "none" || t === "nil" || t === "—" || t === "-") return true;
  if (t === "not applicable" || t === "not applicable.") return true;
  return false;
}
