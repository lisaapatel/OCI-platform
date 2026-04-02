import {
  allOciApplicantPhotoChecksPass,
  evaluateOciApplicantPhotoDimensionsAndSize,
  evaluateOciApplicantPhotoExportBlob,
  ociApplicantPhotoMimeLooksJpeg,
  OCI_APPLICANT_PHOTO_MAX_PX,
  OCI_APPLICANT_PHOTO_MIN_PX,
  OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX,
} from "@/lib/oci-applicant-photo-rules";
import { PORTAL_IMAGE_MAX_BYTES } from "@/lib/portal-constants";

describe("oci-applicant-photo-rules", () => {
  test("evaluateOciApplicantPhotoDimensionsAndSize matches portal square tolerance", () => {
    const ok = evaluateOciApplicantPhotoDimensionsAndSize(
      600,
      600 - OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX,
      PORTAL_IMAGE_MAX_BYTES
    );
    expect(ok.square).toBe(true);
    const bad = evaluateOciApplicantPhotoDimensionsAndSize(
      600,
      600 - OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX - 1,
      PORTAL_IMAGE_MAX_BYTES
    );
    expect(bad.square).toBe(false);
  });

  test("min/max pixel bounds", () => {
    const below = evaluateOciApplicantPhotoDimensionsAndSize(
      OCI_APPLICANT_PHOTO_MIN_PX - 1,
      OCI_APPLICANT_PHOTO_MIN_PX - 1,
      100
    );
    expect(below.minDim).toBe(false);
    const above = evaluateOciApplicantPhotoDimensionsAndSize(
      OCI_APPLICANT_PHOTO_MAX_PX + 1,
      OCI_APPLICANT_PHOTO_MAX_PX + 1,
      100
    );
    expect(above.maxDim).toBe(false);
  });

  test("underByteLimit uses PORTAL_IMAGE_MAX_BYTES", () => {
    const over = evaluateOciApplicantPhotoDimensionsAndSize(
      600,
      600,
      PORTAL_IMAGE_MAX_BYTES + 1
    );
    expect(over.underByteLimit).toBe(false);
    const under = evaluateOciApplicantPhotoDimensionsAndSize(
      600,
      600,
      PORTAL_IMAGE_MAX_BYTES
    );
    expect(under.underByteLimit).toBe(true);
  });

  test("ociApplicantPhotoMimeLooksJpeg", () => {
    expect(ociApplicantPhotoMimeLooksJpeg("image/jpeg")).toBe(true);
    expect(ociApplicantPhotoMimeLooksJpeg("image/jpg")).toBe(true);
    expect(ociApplicantPhotoMimeLooksJpeg("image/png")).toBe(false);
  });

  test("evaluateOciApplicantPhotoExportBlob: over max bytes fails; padded JPEG at limit passes all", async () => {
    const huge = new Blob(
      [new Uint8Array(PORTAL_IMAGE_MAX_BYTES + 1).fill(0)],
      { type: "image/jpeg" }
    );
    const c = await evaluateOciApplicantPhotoExportBlob(huge, 600, 600);
    expect(c.underByteLimit).toBe(false);
    expect(allOciApplicantPhotoChecksPass(c)).toBe(false);

    const padded = new Uint8Array(PORTAL_IMAGE_MAX_BYTES);
    padded[0] = 0xff;
    padded[1] = 0xd8;
    const okBlob = new Blob([padded], { type: "image/jpeg" });
    const c2 = await evaluateOciApplicantPhotoExportBlob(okBlob, 600, 600);
    expect(allOciApplicantPhotoChecksPass(c2)).toBe(true);
  });
});
