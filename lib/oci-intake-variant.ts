import type { Application, OciIntakeVariant } from "@/lib/types";

/** Allowed non-null values for `applications.oci_intake_variant`. */
export const OCI_INTAKE_VARIANT_VALUES: readonly OciIntakeVariant[] = [
  "new_prev_indian",
  "new_foreign_birth",
  "misc_reissue",
];

const ALLOWED = new Set<string>(OCI_INTAKE_VARIANT_VALUES);

export function isOciServiceType(
  serviceType: Application["service_type"] | string | undefined
): boolean {
  return serviceType === "oci_new" || serviceType === "oci_renewal";
}

/** Parse JSON body value: `null` or omit empty string → null; invalid string → error message. */
export function parseOciIntakeVariantFromBody(
  raw: unknown
): { ok: true; value: OciIntakeVariant | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: "oci_intake_variant must be a string, null, or omitted.",
    };
  }
  const v = raw.trim();
  if (v === "") {
    return { ok: true, value: null };
  }
  if (!ALLOWED.has(v)) {
    return {
      ok: false,
      error:
        "oci_intake_variant must be one of: new_prev_indian, new_foreign_birth, misc_reissue, or null.",
    };
  }
  return { ok: true, value: v as OciIntakeVariant };
}

export function normalizeStoredOciIntakeVariant(
  row: unknown
): OciIntakeVariant | null {
  if (row == null || row === "") return null;
  const s = String(row).trim();
  if (!s) return null;
  if (!ALLOWED.has(s)) return null;
  return s as OciIntakeVariant;
}
