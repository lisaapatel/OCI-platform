/**
 * @jest-environment node
 */

import {
  drivePrefixForDocType,
  govtFixedDriveName,
  originalUploadDriveName,
  portalCompressedDriveName,
  sanitizeDriveFilename,
} from "../../lib/drive-file-naming";

describe("drive-file-naming", () => {
  test("drivePrefixForDocType maps current_passport", () => {
    expect(drivePrefixForDocType("current_passport")).toBe("passport_current");
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
});
