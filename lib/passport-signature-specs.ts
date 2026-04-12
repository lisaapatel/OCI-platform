import {
  ociApplicantPhotoBlobHasJpegMagic,
  ociApplicantPhotoMimeLooksJpeg,
} from "@/lib/oci-applicant-photo-rules";

/**
 * Indian passport renewal signature constraints (Passport Seva upload).
 * Keep strict pixel dimensions and a conservative max-size gate.
 */
export const PASSPORT_RENEWAL_SIGNATURE_SPECS = {
  format: "image/jpeg" as const,
  widthPx: 140,
  heightPx: 60,
  aspectRatio: { width: 7, height: 3 },
  maxSizeKB: 100,
  targetSizeHint: "Target 10-20KB when possible",
} as const;

export const PASSPORT_RENEWAL_SIGNATURE_EXPORT_WIDTH_PX =
  PASSPORT_RENEWAL_SIGNATURE_SPECS.widthPx;
export const PASSPORT_RENEWAL_SIGNATURE_EXPORT_HEIGHT_PX =
  PASSPORT_RENEWAL_SIGNATURE_SPECS.heightPx;

export type PassportRenewalSignatureExportChecks = {
  exactDimensions: boolean;
  maxSizeOk: boolean;
  jpeg: boolean;
};

export async function evaluatePassportRenewalSignatureExportBlob(
  blob: Blob,
  width: number,
  height: number
): Promise<PassportRenewalSignatureExportChecks> {
  const S = PASSPORT_RENEWAL_SIGNATURE_SPECS;
  const maxB = S.maxSizeKB * 1024;
  const jpeg =
    ociApplicantPhotoMimeLooksJpeg(blob.type) ||
    (await ociApplicantPhotoBlobHasJpegMagic(blob));
  return {
    exactDimensions: width === S.widthPx && height === S.heightPx,
    maxSizeOk: blob.size > 0 && blob.size <= maxB,
    jpeg,
  };
}

export function allPassportRenewalSignatureChecksPass(
  c: PassportRenewalSignatureExportChecks | null
): boolean {
  if (!c) return false;
  return c.exactDimensions && c.maxSizeOk && c.jpeg;
}
