import "server-only";

import fs from "node:fs";

import { PDFDocument, StandardFonts } from "pdf-lib";

import {
  FORM_FILLING_TEMPLATE_FILES,
  formFillingTemplatePath,
} from "@/lib/form-filling-templates";
import {
  addPortalFillableTextFields,
  PORTAL_FIELD_PREFIX,
} from "@/lib/pdf-generators/portal-pdf-fillable-fields";

export interface UndertakingPdfInput {
  ociFileReferenceNumber: string;
  applicantFullName: string;
  /** MM/DD/YYYY */
  date: string;
}

/**
 * PDF user space: y = 0 at bottom. Values go into **AcroForm text fields** (editable
 * in Acrobat/Preview) — not flattened — so agents can correct prefilled text.
 *
 * OCI ref: x=425; add `OCI_REF_ABOVE_DASH_PT` so the field clears the dotted leader.
 */
const OCI_REF_ABOVE_DASH_PT = 6;

const FIELDS = {
  ociFileReferenceNumber: {
    x: 425,
    y: 660.2 + OCI_REF_ABOVE_DASH_PT,
    fontSize: 12,
    maxWidth: 114,
  },
  applicantName: {
    x: 413.0,
    y: 315.53,
    fontSize: 10,
    maxWidth: 185,
  },
  date: {
    x: 410.0,
    y: 287.93,
    fontSize: 10,
    maxWidth: 130,
  },
  /** Keep name baselines above the date row (date baseline + clearance). */
  nameMinLowestBaselineY: 299,
} as const;

export async function generateUndertakingPdf(
  input: UndertakingPdfInput,
): Promise<Uint8Array> {
  const templatePath = formFillingTemplatePath("undertakingOciApplicantBlank");
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Missing PDF template at ${templatePath} (${FORM_FILLING_TEMPLATE_FILES.undertakingOciApplicantBlank})`,
    );
  }
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  addPortalFillableTextFields({
    pdfDoc,
    page,
    font,
    fieldKeyPrefix: PORTAL_FIELD_PREFIX.undertaking,
    oci: {
      x: FIELDS.ociFileReferenceNumber.x,
      baselineY: FIELDS.ociFileReferenceNumber.y,
      fontSize: FIELDS.ociFileReferenceNumber.fontSize,
      width: FIELDS.ociFileReferenceNumber.maxWidth,
    },
    name: {
      x: FIELDS.applicantName.x,
      topBaselineY: FIELDS.applicantName.y,
      minLowestBaselineY: FIELDS.nameMinLowestBaselineY,
      fontSize: FIELDS.applicantName.fontSize,
      width: FIELDS.applicantName.maxWidth,
    },
    date: {
      x: FIELDS.date.x,
      baselineY: FIELDS.date.y,
      fontSize: FIELDS.date.fontSize,
      width: FIELDS.date.maxWidth,
    },
    values: {
      ociFileReferenceNumber: input.ociFileReferenceNumber.trim(),
      applicantFullName: input.applicantFullName.trim(),
      date: input.date.trim(),
    },
  });

  return pdfDoc.save();
}
