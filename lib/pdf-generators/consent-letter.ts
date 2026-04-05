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

export interface ConsentLetterPdfInput {
  ociFileReferenceNumber: string;
  applicantFullName: string;
  /** MM/DD/YYYY */
  date: string;
  /** Applicant signature JPEG bytes; omitted if not uploaded yet. */
  signatureJpegBytes?: Uint8Array | null;
}

/**
 * Layout from `consent-letter-blank.pdf` (612×792, same as undertaking). Field
 * baselines taken from pdf.js text positions on the blank:
 * - OCI ref: first line “…file reference number …”, baseline y≈657.94; x≈425 after 12pt prefix from x≈108.
 * - Name / Date: labels at x≈373.5 / 376.9, y≈337.1 / 309.5 (12pt); values start after label width + gap.
 * - Signature: JPEG from Drive `applicant_signature`, drawn above “(Signature of the OCI applicant)” (~y≈364.7); not a form field (image only).
 * - OCI ref / name / date: **fillable AcroForm** text (not flattened).
 */
const OCI_REF_ABOVE_DASH_PT = 6;

const FIELDS = {
  ociFileReferenceNumber: {
    x: 425,
    y: 657.94 + OCI_REF_ABOVE_DASH_PT,
    fontSize: 12,
    maxWidth: 120,
  },
  /** After “Name:” — wide box through right margin so long names fit in the form field. */
  applicantName: {
    x: 413,
    y: 337.13,
    fontSize: 12,
    maxWidth: 195,
  },
  /** After “Date:” (12pt Helvetica ≈28.7pt wide at x≈376.9). */
  date: {
    x: 410,
    y: 309.53,
    fontSize: 12,
    maxWidth: 130,
  },
  nameMinLowestBaselineY: 321,
} as const;

/** Above “(Signature of the OCI applicant)” (baseline ~364.7). */
const SIGNATURE = {
  x: 72,
  y: 378,
  maxWidth: 260,
  maxHeight: 56,
} as const;

export async function generateConsentLetterPdf(
  input: ConsentLetterPdfInput,
): Promise<Uint8Array> {
  const templatePath = formFillingTemplatePath("consentLetterBlank");
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Missing PDF template at ${templatePath} (${FORM_FILLING_TEMPLATE_FILES.consentLetterBlank})`,
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
    fieldKeyPrefix: PORTAL_FIELD_PREFIX.consent,
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
      maxWidgetTopY: 363,
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

  const sig = input.signatureJpegBytes;
  if (sig && sig.byteLength > 0) {
    try {
      const jpg = await pdfDoc.embedJpg(sig);
      const iw = jpg.width;
      const ih = jpg.height;
      const scale = Math.min(
        SIGNATURE.maxWidth / iw,
        SIGNATURE.maxHeight / ih,
        1,
      );
      const w = iw * scale;
      const h = ih * scale;
      page.drawImage(jpg, {
        x: SIGNATURE.x,
        y: SIGNATURE.y,
        width: w,
        height: h,
      });
    } catch {
      /* invalid JPEG — skip overlay */
    }
  }

  return pdfDoc.save();
}
