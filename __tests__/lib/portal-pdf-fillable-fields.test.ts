/**
 * @jest-environment node
 */
import fs from "node:fs";
import path from "node:path";

import { PDFDocument } from "pdf-lib";

import { generateAffidavitInLieuPdf } from "@/lib/pdf-generators/affidavit-in-lieu";
import { generateConsentLetterPdf } from "@/lib/pdf-generators/consent-letter";
import { generateUndertakingPdf } from "@/lib/pdf-generators/undertaking-oci-applicant";
import { PORTAL_FIELD_PREFIX } from "@/lib/pdf-generators/portal-pdf-fillable-fields";

const undertakingTpl = path.join(
  process.cwd(),
  "form-filling-templates",
  "undertaking-oci-applicant-blank.pdf",
);
const consentTpl = path.join(
  process.cwd(),
  "form-filling-templates",
  "consent-letter-blank.pdf",
);
const affidavitTpl = path.join(
  process.cwd(),
  "form-filling-templates",
  "affidavit-in-lieu-of-originals-blank.pdf",
);

describe("portal PDFs stay fillable (AcroForm, not flattened)", () => {
  test("undertaking has three editable text fields with values", async () => {
    if (!fs.existsSync(undertakingTpl)) {
      // CI / fresh clone may omit binary templates
      return;
    }
    const bytes = await generateUndertakingPdf({
      ociFileReferenceNumber: "OCIUSA2024TEST",
      applicantFullName: "Jane Q Public",
      date: "04/04/2026",
    });
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    const names = form.getFields().map((f) => f.getName());
    expect(names).toEqual(
      expect.arrayContaining([
        `${PORTAL_FIELD_PREFIX.undertaking}_oci_file_ref`,
        `${PORTAL_FIELD_PREFIX.undertaking}_applicant_full_name`,
        `${PORTAL_FIELD_PREFIX.undertaking}_date`,
      ]),
    );
    expect(form.getFields().length).toBeGreaterThanOrEqual(3);
    expect(form.getTextField(`${PORTAL_FIELD_PREFIX.undertaking}_oci_file_ref`).getText()).toBe(
      "OCIUSA2024TEST",
    );
    expect(
      form.getTextField(`${PORTAL_FIELD_PREFIX.undertaking}_applicant_full_name`).getText(),
    ).toBe("Jane Q Public");
  });

  test("consent letter has three editable text fields", async () => {
    if (!fs.existsSync(consentTpl)) {
      return;
    }
    const bytes = await generateConsentLetterPdf({
      ociFileReferenceNumber: "OCIUSA2024TEST",
      applicantFullName: "Jane Q Public",
      date: "04/04/2026",
    });
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    const names = form.getFields().map((f) => f.getName());
    expect(names).toEqual(
      expect.arrayContaining([
        `${PORTAL_FIELD_PREFIX.consent}_oci_file_ref`,
        `${PORTAL_FIELD_PREFIX.consent}_applicant_full_name`,
        `${PORTAL_FIELD_PREFIX.consent}_date`,
      ]),
    );
  });

  test("affidavit has oath, printed name, and seven line fields", async () => {
    if (!fs.existsSync(affidavitTpl)) {
      return;
    }
    const bytes = await generateAffidavitInLieuPdf({
      applicantFullName: "Jane Q Public",
      documentLines: ["Photocopy of Current Passport"],
    });
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    const names = form.getFields().map((f) => f.getName());
    const p = PORTAL_FIELD_PREFIX.affidavit;
    expect(names).toEqual(
      expect.arrayContaining([
        `${p}_applicant_oath`,
        `${p}_applicant_printed`,
        `${p}_line_a`,
        `${p}_line_g`,
      ]),
    );
    expect(form.getTextField(`${p}_applicant_oath`).getText()).toBe("Jane Q Public");
    expect(form.getTextField(`${p}_line_a`).getText()).toBe("Photocopy of Current Passport");
  });

  test("consent name field stores full string (no truncation)", async () => {
    if (!fs.existsSync(consentTpl)) {
      return;
    }
    const full = "AARIT HARSHAL SHETH EXTRA";
    const bytes = await generateConsentLetterPdf({
      ociFileReferenceNumber: "OCIUSA2024TEST",
      applicantFullName: full,
      date: "04/04/2026",
    });
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    expect(
      form.getTextField(`${PORTAL_FIELD_PREFIX.consent}_applicant_full_name`).getText(),
    ).toBe(full);
  });
});
