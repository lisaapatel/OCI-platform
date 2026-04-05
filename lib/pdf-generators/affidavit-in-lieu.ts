import "server-only";

import fs from "node:fs";

import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PDFFont } from "pdf-lib";

import {
  FORM_FILLING_TEMPLATE_FILES,
  formFillingTemplatePath,
} from "@/lib/form-filling-templates";
import { PORTAL_FIELD_PREFIX } from "@/lib/pdf-generators/portal-pdf-fillable-fields";

export interface AffidavitInLieuPdfInput {
  applicantFullName: string;
  /** Up to seven lines for (a)–(g); pad with empty strings if fewer. */
  documentLines: string[];
}

/**
 * Text positions from pdf.js on `affidavit-in-lieu-of-originals-blank.pdf` (612×792).
 * Baselines are PDF user-space (origin bottom-left).
 */
const OATH_NAME = {
  x: 80,
  baselineY: 637.2,
  fontSize: 12,
  width: 275,
} as const;

/** After “Printed Name” label on same row. */
const PRINTED_NAME = {
  x: 168,
  baselineY: 129.3,
  fontSize: 12,
  width: 400,
} as const;

const LINE_BASELINES = [
  597.6, 549.9, 502.3, 454.6, 407.0, 359.4, 311.8,
] as const;

const LINE = {
  x: 90,
  fontSize: 10,
  width: 500,
} as const;

/**
 * Fine-tune checklist row vertical alignment for this affidavit template.
 * Positive value moves text higher.
 */
const LINE_BASELINE_NUDGE_PT = 2;
/** Keep the first applicant-name field aligned with the printed line. */
const OATH_NAME_BASELINE_NUDGE_PT = 2;

function singleLineWidgetRectForBaseline(
  baselineY: number,
  fontSize: number,
  font: PDFFont,
): { y: number; height: number } {
  const height = fontSize * 1.45;
  const innerH = height - 4;
  const fontH = font.heightAtSize(fontSize, { descender: false });
  const yInner = 1 + (innerH / 2 - fontH / 2);
  const y = baselineY - yInner;
  return { y, height };
}

export async function generateAffidavitInLieuPdf(
  input: AffidavitInLieuPdfInput,
): Promise<Uint8Array> {
  const templatePath = formFillingTemplatePath("affidavitInLieuBlank");
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Missing PDF template at ${templatePath} (${FORM_FILLING_TEMPLATE_FILES.affidavitInLieuBlank})`,
    );
  }
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const form = pdfDoc.getForm();
  const prefix = PORTAL_FIELD_PREFIX.affidavit;
  const name = input.applicantFullName.trim();

  const oathField = form.createTextField(`${prefix}_applicant_oath`);
  const oathRect = singleLineWidgetRectForBaseline(
    OATH_NAME.baselineY + OATH_NAME_BASELINE_NUDGE_PT,
    OATH_NAME.fontSize,
    font,
  );
  oathField.addToPage(page, {
    x: OATH_NAME.x,
    y: oathRect.y,
    width: OATH_NAME.width,
    height: oathRect.height,
    font,
    borderWidth: 0,
  });
  oathField.setFontSize(OATH_NAME.fontSize);
  oathField.setText(name);

  const printedField = form.createTextField(`${prefix}_applicant_printed`);
  const printedRect = singleLineWidgetRectForBaseline(
    PRINTED_NAME.baselineY,
    PRINTED_NAME.fontSize,
    font,
  );
  printedField.addToPage(page, {
    x: PRINTED_NAME.x,
    y: printedRect.y,
    width: PRINTED_NAME.width,
    height: printedRect.height,
    font,
    borderWidth: 0,
  });
  printedField.setFontSize(PRINTED_NAME.fontSize);
  printedField.setText(name);

  const lines = [...input.documentLines];
  while (lines.length < 7) lines.push("");

  for (let i = 0; i < 7; i++) {
    const field = form.createTextField(`${prefix}_line_${String.fromCharCode(97 + i)}`);
    const baselineY = LINE_BASELINES[i]! + LINE_BASELINE_NUDGE_PT;
    const rect = singleLineWidgetRectForBaseline(
      baselineY,
      LINE.fontSize,
      font,
    );
    field.addToPage(page, {
      x: LINE.x,
      y: rect.y,
      width: LINE.width,
      height: rect.height,
      font,
      borderWidth: 0,
    });
    field.setFontSize(LINE.fontSize);
    field.setText(lines[i]!.trim());
  }

  form.updateFieldAppearances(font);
  return pdfDoc.save();
}
