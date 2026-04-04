import "server-only";

import fs from "node:fs";
import path from "node:path";

import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";

export interface UndertakingPdfInput {
  ociFileReferenceNumber: string;
  applicantFullName: string;
  /** MM/DD/YYYY */
  date: string;
}

/**
 * PDF user space: y = 0 at bottom. Name/Date y match pdf.js baselines on the template.
 *
 * OCI file ref: spec y=660.2, x=416.5. Runtime check: 12pt Helvetica width from template
 * line start (x≈108) through “…file reference number ” ends ≈423; 416.5 overlaps that
 * prefix — start value at **x=425** (~2pt after prefix). maxWidth ≈539.7−425.
 */
const FIELDS = {
  ociFileReferenceNumber: {
    x: 425,
    y: 660.2,
    fontSize: 12,
    maxWidth: 114,
  },
  applicantName: {
    x: 413.0,
    /** Same baseline as the “Name:” label. */
    y: 315.53,
    fontSize: 10,
    maxWidth: 127,
  },
  date: {
    x: 410.0,
    /** Same baseline as the “Date:” label. */
    y: 287.93,
    fontSize: 10,
    maxWidth: 130,
  },
} as const;

function fitTextToWidth(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string {
  const t = text.trim();
  if (t === "") return t;
  if (font.widthOfTextAtSize(t, fontSize) <= maxWidth) return t;
  const ellipsis = "…";
  for (let n = t.length; n >= 1; n--) {
    const candidate = t.slice(0, n) + ellipsis;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      return candidate;
    }
  }
  return ellipsis;
}

export async function generateUndertakingPdf(
  input: UndertakingPdfInput,
): Promise<Uint8Array> {
  const templatePath = path.join(
    process.cwd(),
    "public/templates/undertaking-oci-applicant-blank.pdf",
  );
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Missing PDF template at ${templatePath}`);
  }
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const oci = fitTextToWidth(
    input.ociFileReferenceNumber,
    font,
    FIELDS.ociFileReferenceNumber.fontSize,
    FIELDS.ociFileReferenceNumber.maxWidth,
  );
  const name = fitTextToWidth(
    input.applicantFullName,
    font,
    FIELDS.applicantName.fontSize,
    FIELDS.applicantName.maxWidth,
  );
  const dateStr = fitTextToWidth(
    input.date,
    font,
    FIELDS.date.fontSize,
    FIELDS.date.maxWidth,
  );

  page.drawText(oci, {
    x: FIELDS.ociFileReferenceNumber.x,
    y: FIELDS.ociFileReferenceNumber.y,
    size: FIELDS.ociFileReferenceNumber.fontSize,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText(name, {
    x: FIELDS.applicantName.x,
    y: FIELDS.applicantName.y,
    size: FIELDS.applicantName.fontSize,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText(dateStr, {
    x: FIELDS.date.x,
    y: FIELDS.date.y,
    size: FIELDS.date.fontSize,
    font,
    color: rgb(0, 0, 0),
  });

  return pdfDoc.save();
}
