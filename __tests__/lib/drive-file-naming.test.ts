/**
 * @jest-environment node
 */

import {
  drivePrefixForDocType,
  govtFixedDriveName,
  originalUploadDriveName,
  portalCompressedDriveName,
  sanitizeDriveFilename,
  standalonePhotoDriveName,
} from "../../lib/drive-file-naming";

describe("drive-file-naming", () => {
  test("drivePrefixForDocType maps current_passport", () => {
    expect(drivePrefixForDocType("current_passport")).toBe("passport_current");
  });

  test("drivePrefixForDocType maps phase-1 OCI variant doc types", () => {
    expect(drivePrefixForDocType("indian_citizenship_relinquishment")).toBe(
      "citizenship_relinquishment_india"
    );
    expect(drivePrefixForDocType("applicant_oci_card")).toBe("oci_applicant_card");
  });

  test("originalUploadDriveName prefixes customer file", () => {
    expect(originalUploadDriveName("current_passport", "passport 2.pdf")).toBe(
      "passport_current_passport_2.pdf"
    );
  });

  test("originalUploadDriveName is idempotent when already prefixed", () => {
    expect(
      originalUploadDriveName(
        "current_passport",
        "passport_current_passport_2.pdf"
      )
    ).toBe("passport_current_passport_2.pdf");
  });

  test("portalCompressedDriveName short form", () => {
    expect(
      portalCompressedDriveName("current_passport", "anything.pdf", "application/pdf")
    ).toBe("passport_current_compressed.pdf");
  });

  test("govtFixedDriveName", () => {
    expect(govtFixedDriveName("applicant_photo")).toBe("photo_applicant_fixed.jpg");
  });

  test("sanitizeDriveFilename caps length", () => {
    const long = "a".repeat(300) + ".pdf";
    const out = sanitizeDriveFilename(long);
    expect(out.length).toBeLessThanOrEqual(220);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  test("standalonePhotoDriveName without client", () => {
    const name = standalonePhotoDriveName("photo", "");
    expect(name).toMatch(/^photo_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.jpg$/);
  });

  test("standalonePhotoDriveName with client", () => {
    const name = standalonePhotoDriveName("signature", "Jane Doe");
    expect(name).toMatch(
      /^signature_Jane_Doe_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.jpg$/
    );
  });
});
