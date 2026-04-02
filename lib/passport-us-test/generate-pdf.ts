import fs from "node:fs";
import path from "node:path";

import { PDFDocument } from "pdf-lib";

function templatePath(): string {
  return path.join(process.cwd(), "templates", "ds82.pdf");
}

/**
 * Fill DS-82–style AcroForm text fields and return flattened PDF bytes.
 * Unknown field names in `data` are skipped (template may omit fields).
 */
export async function generateDs82Pdf(
  data: Record<string, string>,
): Promise<Uint8Array> {
  const abs = templatePath();
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing PDF template at ${abs}`);
  }
  const templateBytes = fs.readFileSync(abs);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  for (const [key, value] of Object.entries(data)) {
    try {
      form.getTextField(key).setText(value || "");
    } catch {
      // Field not present in this template (e.g. official DS-82 uses different names)
    }
  }

  form.flatten();
  return pdfDoc.save();
}
