import type { OciIntakeVariant } from "@/lib/types";
import { OCI_NEW_CHECKLIST, type ChecklistItem } from "@/lib/oci-new-checklist";
import { PARENT_DOCUMENT_CHECKLIST_ITEMS } from "@/lib/parent-documents";

/**
 * OCI minors use father/mother + `parent_address_proof`; hide adult-oriented overlap.
 * `address_proof` duplicates the minor parent address slot (same doc concept).
 */
const OCI_MINOR_EXCLUDED_BASE_DOC_TYPES = new Set([
  "address_proof",
  "marriage_certificate",
  "marriage_affidavit",
  "employment_letter",
  "parent_passport",
  "parent_oci",
]);

function ociNewChecklistForContext(is_minor: boolean): ChecklistItem[] {
  if (!is_minor) return [...OCI_NEW_CHECKLIST];
  return OCI_NEW_CHECKLIST.filter(
    (i) => !OCI_MINOR_EXCLUDED_BASE_DOC_TYPES.has(i.doc_type)
  );
}

/**
 * Foreign-by-birth intake: same `doc_type` (`former_indian_passport`) but neutral copy —
 * a former non-Indian passport may still apply; only the Indian-specific wording is removed.
 */
function ociBaseAfterVariantAdjust(
  rows: ChecklistItem[],
  oci_intake_variant: OciIntakeVariant | null | undefined
): ChecklistItem[] {
  if (oci_intake_variant !== "new_foreign_birth") return rows;
  return rows.map((i) =>
    i.doc_type === "former_indian_passport"
      ? {
          ...i,
          label: "Applicant's Former Passport (if any)",
          optionalNote:
            "Optional — e.g. a previous passport from another country, if applicable.",
        }
      : i
  );
}

function variantExtraItems(
  oci_intake_variant: OciIntakeVariant | null | undefined
): ChecklistItem[] {
  const v = oci_intake_variant ?? null;
  if (v === "new_prev_indian") {
    return [
      {
        doc_type: "indian_citizenship_relinquishment",
        label: "Indian Citizenship Relinquishment / Surrender",
        required: false,
        optionalNote:
          "Renunciation certificate and/or surrender certificate — upload whichever applies (checklist guidance).",
      },
    ];
  }
  if (v === "misc_reissue") {
    return [
      {
        doc_type: "applicant_oci_card",
        label: "Applicant's OCI Card (existing)",
        required: false,
        optionalNote:
          "Front and back of the current OCI card for reissue/correction/update matters (checklist guidance).",
      },
    ];
  }
  return [];
}

/**
 * OCI base + variant rows only (no minor parent appendix). Uses the same minor base
 * filter as `composeOciChecklist` for application detail upload cards.
 */
export function composeOciChecklistCore(input: {
  oci_intake_variant: OciIntakeVariant | null | undefined;
  is_minor: boolean;
}): ChecklistItem[] {
  const base = ociBaseAfterVariantAdjust(
    ociNewChecklistForContext(input.is_minor),
    input.oci_intake_variant
  );
  return [...base, ...variantExtraItems(input.oci_intake_variant)];
}

/**
 * Full OCI checklist: base rows, variant-specific advisory rows, then minor parent slots.
 * Variant-specific doc types are never required in phase 1 (checklist guidance only).
 */
export function composeOciChecklist(input: {
  oci_intake_variant: OciIntakeVariant | null | undefined;
  is_minor: boolean;
}): ChecklistItem[] {
  const core = composeOciChecklistCore(input);
  if (input.is_minor) {
    return [...core, ...PARENT_DOCUMENT_CHECKLIST_ITEMS];
  }
  return core;
}
