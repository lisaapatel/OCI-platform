/**
 * @jest-environment node
 */

import { shouldSkipAiExtraction } from "../../lib/oci-new-checklist";

describe("shouldSkipAiExtraction", () => {
  test("still skips image-only and supporting docs by default", () => {
    expect(shouldSkipAiExtraction("applicant_photo")).toBe(true);
    expect(shouldSkipAiExtraction("applicant_signature")).toBe(true);
    expect(shouldSkipAiExtraction("us_status_proof")).toBe(true);
  });

  test("does not skip us_status_proof for passport_renewal", () => {
    expect(
      shouldSkipAiExtraction("us_status_proof", {
        serviceType: "passport_renewal",
      })
    ).toBe(false);
  });
});

