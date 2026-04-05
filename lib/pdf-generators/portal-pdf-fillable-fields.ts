import "server-only";

import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";

/**
 * AcroForm text field names (stable for scripting); prefix keeps undertaking vs
 * consent distinct in tools that merge PDFs.
 */
export const PORTAL_FIELD_PREFIX = {
  undertaking: "portal_ut",
  consent: "portal_cn",
  affidavit: "portal_af",
} as const;

export type PortalFillableSingleLineSpec = {
  x: number;
  /** Text baseline y (PDF bottom-left origin). */
  baselineY: number;
  fontSize: number;
  width: number;
};

export type PortalFillableNameSpec = {
  x: number;
  topBaselineY: number;
  minLowestBaselineY: number;
  fontSize: number;
  width: number;
  /** Minimum lines of vertical space for multiline appearance (pdf-lib clips to widget height). */
  minLineCount?: number;
  /** Optional cap on widget top edge (PDF y); use below signature artwork on consent letter. */
  maxWidgetTopY?: number;
};

/**
 * pdf-lib single-line fields use `layoutSinglelineText`: baseline is **vertically
 * centered** in the inner bounds (not drawText-style bottom alignment).
 */
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

/**
 * pdf-lib `layoutMultilineText` places the first line just below the **inner top**
 * of the widget (`y -= lineHeight` from bounds.y + bounds.height). Position the
 * widget so that first baseline matches `topBaselineY` (printed “Name:” line).
 */
function nameWidgetRectForMultiline(
  opts: PortalFillableNameSpec,
  font: PDFFont,
): { y: number; height: number } {
  const fs = opts.fontSize;
  const hAt = font.heightAtSize(fs);
  const lineH = hAt + hAt * 0.2;
  /** First-line baseline ≈ widgetTop − lineH − (inner top padding ~2). */
  const innerTopPad = 2;
  const targetWidgetTopY = opts.topBaselineY + lineH + innerTopPad;
  const cap = opts.maxWidgetTopY;
  const widgetTopY =
    cap === undefined ? targetWidgetTopY : Math.min(targetWidgetTopY, cap);

  const bottomY = opts.minLowestBaselineY - 4;
  const minLines = opts.minLineCount ?? 2;
  const minH = minLines * lineH;

  const naturalHeight = widgetTopY - bottomY;
  const height = Math.max(minH, naturalHeight);
  let y = widgetTopY - height;
  if (y < bottomY) {
    y = bottomY;
    return { y, height: widgetTopY - bottomY };
  }
  return { y, height };
}

/**
 * Adds editable AcroForm text fields (prefilled, not flattened) so agents can fix
 * typos in Acrobat/Preview without regenerating from the app.
 */
export function addPortalFillableTextFields(opts: {
  pdfDoc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fieldKeyPrefix: string;
  oci: PortalFillableSingleLineSpec;
  name: PortalFillableNameSpec;
  date: PortalFillableSingleLineSpec;
  values: {
    ociFileReferenceNumber: string;
    applicantFullName: string;
    date: string;
  };
}): void {
  const { pdfDoc, page, font, fieldKeyPrefix } = opts;
  const form = pdfDoc.getForm();

  const ociField = form.createTextField(`${fieldKeyPrefix}_oci_file_ref`);
  const ociRect = singleLineWidgetRectForBaseline(
    opts.oci.baselineY,
    opts.oci.fontSize,
    font,
  );
  ociField.addToPage(page, {
    x: opts.oci.x,
    y: ociRect.y,
    width: opts.oci.width,
    height: ociRect.height,
    font,
    borderWidth: 0,
  });
  ociField.setFontSize(opts.oci.fontSize);
  ociField.setText(opts.values.ociFileReferenceNumber);

  const nameField = form.createTextField(`${fieldKeyPrefix}_applicant_full_name`);
  nameField.enableMultiline();
  const nameRect = nameWidgetRectForMultiline(opts.name, font);
  nameField.addToPage(page, {
    x: opts.name.x,
    y: nameRect.y,
    width: opts.name.width,
    height: nameRect.height,
    font,
    borderWidth: 0,
  });
  nameField.setFontSize(opts.name.fontSize);
  /** Full string only — wrapping for display is up to the viewer / field box; pre-splitting hid later words in some clients. */
  nameField.setText(opts.values.applicantFullName.trim());

  const dateField = form.createTextField(`${fieldKeyPrefix}_date`);
  const dateRect = singleLineWidgetRectForBaseline(
    opts.date.baselineY,
    opts.date.fontSize,
    font,
  );
  dateField.addToPage(page, {
    x: opts.date.x,
    y: dateRect.y,
    width: opts.date.width,
    height: dateRect.height,
    font,
    borderWidth: 0,
  });
  dateField.setFontSize(opts.date.fontSize);
  dateField.setText(opts.values.date);

  form.updateFieldAppearances(font);
}
