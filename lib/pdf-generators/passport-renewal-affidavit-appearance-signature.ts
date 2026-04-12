import "server-only";

import fs from "node:fs";

import { PDFDocument } from "pdf-lib";

import {
  FORM_FILLING_TEMPLATE_FILES,
  formFillingTemplatePath,
} from "@/lib/form-filling-templates";

export interface PassportRenewalAffidavitAppearanceInput {
  applicantFullName: string;
  passportNumber: string;
  applicantPhotoBytes?: Uint8Array | null;
}

/**
 * Template has native AcroForm fields; we set only the values requested by ops:
 * - applicant name ("I, ____")
 * - passport number ("holder of passport No. ____")
 * and stamp applicant photo in the top-right margin.
 */
const FIELD_NAMES = {
  applicantName: "text_2kmlj",
  passportNumber: "text_5ybfw",
} as const;

const PHOTO = {
  x: 540,
  y: 718,
  width: 54,
  height: 64,
} as const;

export async function generatePassportRenewalAffidavitAppearancePdf(
  input: PassportRenewalAffidavitAppearanceInput,
): Promise<Uint8Array> {
  const templatePath = formFillingTemplatePath(
    "passportRenewalAffidavitAppearanceSignature",
  );
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Missing PDF template at ${templatePath} (${FORM_FILLING_TEMPLATE_FILES.passportRenewalAffidavitAppearanceSignature})`,
    );
  }

  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const form = pdfDoc.getForm();

  const safeSet = (fieldName: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      form.getTextField(fieldName).setText(trimmed);
    } catch {
      /* field missing in template variant — skip */
    }
  };

  safeSet(FIELD_NAMES.applicantName, input.applicantFullName);
  safeSet(FIELD_NAMES.passportNumber, input.passportNumber);

  const photo = input.applicantPhotoBytes;
  if (photo && photo.byteLength > 0) {
    try {
      const jpg = await pdfDoc.embedJpg(photo);
      page.drawImage(jpg, PHOTO);
    } catch {
      try {
        const png = await pdfDoc.embedPng(photo);
        page.drawImage(png, PHOTO);
      } catch {
        /* invalid image bytes — skip */
      }
    }
  }

  return pdfDoc.save();
}
