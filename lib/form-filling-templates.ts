import path from "node:path";

/**
 * Version-controlled blanks for portal PDFs (undertaking, consent letter, etc.).
 * Add new files under `form-filling-templates/` at the repo root.
 */
export const FORM_FILLING_TEMPLATES_DIR = path.join(
  process.cwd(),
  "form-filling-templates",
);

export const FORM_FILLING_TEMPLATE_FILES = {
  undertakingOciApplicantBlank: "undertaking-oci-applicant-blank.pdf",
  consentLetterBlank: "consent-letter-blank.pdf",
  affidavitInLieuBlank: "affidavit-in-lieu-of-originals-blank.pdf",
} as const;

export type FormFillingTemplateKey =
  keyof typeof FORM_FILLING_TEMPLATE_FILES;

export function formFillingTemplatePath(
  key: FormFillingTemplateKey,
): string {
  return path.join(
    FORM_FILLING_TEMPLATES_DIR,
    FORM_FILLING_TEMPLATE_FILES[key],
  );
}
