import type { OciIntakeVariant } from "@/lib/types";

/**
 * Shown on application detail when `oci_intake_variant` is null on an OCI app
 * (legacy row or not set at creation). Keep in sync with PLATFORM.md.
 */
export const OCI_INTAKE_VARIANT_LEGACY_DISPLAY =
  "Legacy / not specified — base OCI checklist only (no variant-specific document slots).";

/** Wording for New Application OCI-only intake (Q1–Q3). */
export const OCI_NEW_APP_INTAKE_COPY = {
  q1Legend:
    "Is this first-time OCI registration or an existing OCI reissue / update?",
  q1FirstTime: "First-time OCI registration",
  q1Existing: "Existing OCI reissue / update",
  q2Legend: "For first-time registration, which applies?",
  q2PrevIndian:
    "Applicant previously held Indian citizenship or Indian passport",
  q2ForeignBirth: "Applicant is a foreign national by birth",
  q3Legend: "Is the applicant under 18?",
  q3Help:
    "If yes, parent passport (father or mother) and parent address proof are collected on the checklist.",
} as const;

/** New-application Q1: first-time OCI vs existing card matter */
export type OciRegistrationKind = "first_time" | "existing";

/** New-application Q2 when first-time: prior Indian ties vs foreign birth */
export type OciFirstTimeTrack = "prev_indian" | "foreign_birth";

/**
 * Maps minimal intake answers to `oci_intake_variant`.
 * Returns null until required answers for the chosen branch are set.
 */
export function ociIntakeVariantFromAnswers(
  registrationKind: "" | OciRegistrationKind,
  firstTimeTrack: "" | OciFirstTimeTrack
): OciIntakeVariant | null {
  if (registrationKind === "existing") return "misc_reissue";
  if (registrationKind === "first_time") {
    if (firstTimeTrack === "prev_indian") return "new_prev_indian";
    if (firstTimeTrack === "foreign_birth") return "new_foreign_birth";
  }
  return null;
}

/** Human-readable label for application detail and similar surfaces. */
export function formatOciIntakeVariantLabel(
  variant: OciIntakeVariant | null | undefined
): string | null {
  if (variant == null) return null;
  switch (variant) {
    case "new_prev_indian":
      return "New OCI — Previously Indian passport holder";
    case "new_foreign_birth":
      return "New OCI — Foreign national by birth";
    case "misc_reissue":
      return "OCI Misc / Reissue";
    default:
      return null;
  }
}
