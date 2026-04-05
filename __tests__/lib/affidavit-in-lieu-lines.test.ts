import {
  buildAffidavitDocumentLines,
  buildAffidavitPhotocopyLines,
  validateAffidavitSelection,
} from "@/lib/affidavit-in-lieu-lines";
import type { ChecklistItem } from "@/lib/oci-new-checklist";

const sampleChecklist: ChecklistItem[] = [
  { doc_type: "current_passport", label: "Current Passport", required: true },
  { doc_type: "birth_certificate", label: "Birth Certificate", required: true },
  { doc_type: "address_proof", label: "Address Proof", required: true },
];

describe("affidavit-in-lieu-lines", () => {
  test("validateAffidavitSelection rejects unknown doc type", () => {
    const r = validateAffidavitSelection(sampleChecklist, ["current_passport", "nope"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  test("validateAffidavitSelection rejects empty when no custom lines", () => {
    const r = validateAffidavitSelection(sampleChecklist, [], []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });

  test("validateAffidavitSelection rejects more than seven", () => {
    const many = Array.from({ length: 8 }, (_, i) => `t${i}`);
    const big: ChecklistItem[] = many.map((dt, i) => ({
      doc_type: dt,
      label: `L${i}`,
      required: false,
    }));
    const r = validateAffidavitSelection(big, many);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });

  test("buildAffidavitPhotocopyLines uses checklist order and prefix", () => {
    const lines = buildAffidavitPhotocopyLines(sampleChecklist, new Set(["address_proof", "current_passport"]));
    expect(lines).toEqual([
      "Photocopy of Current Passport",
      "Photocopy of Address Proof",
    ]);
  });

  test("validateAffidavitSelection accepts custom-only lines", () => {
    const r = validateAffidavitSelection(sampleChecklist, [], ["Custom Doc"]);
    expect(r.ok).toBe(true);
  });

  test("buildAffidavitDocumentLines appends custom lines", () => {
    const lines = buildAffidavitDocumentLines(
      sampleChecklist,
      new Set(["current_passport"]),
      ["Custom Line 1", "", "  ", "Custom Line 2"],
    );
    expect(lines).toEqual([
      "Photocopy of Current Passport",
      "Custom Line 1",
      "Custom Line 2",
    ]);
  });
});
