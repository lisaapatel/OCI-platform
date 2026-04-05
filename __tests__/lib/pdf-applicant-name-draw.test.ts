import { PDFDocument, StandardFonts } from "pdf-lib";

import { wrapTextToLines } from "@/lib/pdf-generators/applicant-name-draw";

describe("wrapTextToLines", () => {
  let font: Awaited<ReturnType<PDFDocument["embedFont"]>>;

  beforeAll(async () => {
    const doc = await PDFDocument.create();
    font = await doc.embedFont(StandardFonts.Helvetica);
  });

  test("single short line", () => {
    const lines = wrapTextToLines("Jane Doe", font, 12, 500);
    expect(lines).toEqual(["Jane Doe"]);
  });

  test("splits on spaces when over maxWidth", () => {
    const lines = wrapTextToLines(
      "AARIT HARSHAL SHETH LONGNAME",
      font,
      12,
      120,
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 12)).toBeLessThanOrEqual(120.01);
    }
  });
});
