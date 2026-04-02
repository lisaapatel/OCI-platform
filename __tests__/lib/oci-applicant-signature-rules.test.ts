import {
  allOciApplicantSignatureChecksPass,
  evaluateOciApplicantSignatureDimensionsAndSize,
  evaluateOciApplicantSignatureExportBlob,
  ociApplicantSignatureMimeLooksJpeg,
} from "@/lib/oci-applicant-signature-rules";
import { PORTAL_IMAGE_MAX_BYTES } from "@/lib/portal-constants";

describe("oci-applicant-signature-rules", () => {
  test("ratio tolerance passes and fails", () => {
    const ok = evaluateOciApplicantSignatureDimensionsAndSize(
      600,
      200,
      PORTAL_IMAGE_MAX_BYTES
    );
    expect(ok.ratio).toBe(true);

    // w/h too large: 600 / 195 = 3.0769 (diff 0.0769 > 0.06)
    const bad = evaluateOciApplicantSignatureDimensionsAndSize(
      600,
      195,
      PORTAL_IMAGE_MAX_BYTES
    );
    expect(bad.ratio).toBe(false);
  });

  test("min/max pixel bounds", () => {
    const below = evaluateOciApplicantSignatureDimensionsAndSize(
      199,
      67,
      100
    );
    expect(below.minDim).toBe(false);

    const above = evaluateOciApplicantSignatureDimensionsAndSize(
      1501,
      500,
      100
    );
    expect(above.maxDim).toBe(false);
  });

  test("jpeg mime detection", () => {
    expect(ociApplicantSignatureMimeLooksJpeg("image/jpeg")).toBe(true);
    expect(ociApplicantSignatureMimeLooksJpeg("image/jpg")).toBe(true);
    expect(ociApplicantSignatureMimeLooksJpeg("image/png")).toBe(false);
  });

  test("blob evaluation: under-limit passes, over-limit fails", async () => {
    const baseBytes = new Uint8Array(PORTAL_IMAGE_MAX_BYTES);
    baseBytes[0] = 0xff;
    baseBytes[1] = 0xd8;

    const okBlob = new Blob([baseBytes], { type: "image/jpeg" });
    const okChecks = await evaluateOciApplicantSignatureExportBlob(
      okBlob,
      600,
      200
    );
    expect(okChecks.underByteLimit).toBe(true);
    expect(allOciApplicantSignatureChecksPass(okChecks)).toBe(true);

    const overBlob = new Blob(
      [new Uint8Array(PORTAL_IMAGE_MAX_BYTES + 1).fill(0)],
      { type: "image/jpeg" }
    );
    const overChecks = await evaluateOciApplicantSignatureExportBlob(
      overBlob,
      600,
      200
    );
    expect(overChecks.underByteLimit).toBe(false);
    expect(allOciApplicantSignatureChecksPass(overChecks)).toBe(false);
  });
});

