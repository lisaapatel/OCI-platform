import {
  ociApplicantPhotoBlobHasJpegMagic,
  ociApplicantPhotoMimeLooksJpeg,
} from "@/lib/oci-applicant-photo-rules";

/** VFS / passport-style photo constraints (crop editor + validation). */
export const PASSPORT_RENEWAL_PHOTO_SPECS = {
  format: "image/jpeg" as const,
  minWidth: 350,
  minHeight: 350,
  maxWidth: 1000,
  maxHeight: 1000,
  aspectRatio: { width: 1, height: 1 },
  maxSizeKB: 100,
  minSizeKB: 20,
  squareTolerancePx: 2,
  backgroundNote: "Plain white background required",
  faceCoverageNote: "Face must fill 70–80% of photo",
} as const;

/** Square export size after crop (within 350–1000px). */
export const PASSPORT_RENEWAL_EXPORT_PX = 600;

export type PassportRenewalPhotoExportChecks = {
  square: boolean;
  minDim: boolean;
  maxDim: boolean;
  byteRangeOk: boolean;
  jpeg: boolean;
};

export function evaluatePassportRenewalPhotoDimensionsAndSize(
  width: number,
  height: number,
  fileSizeBytes: number
): Pick<
  PassportRenewalPhotoExportChecks,
  "square" | "minDim" | "maxDim" | "byteRangeOk"
> {
  const S = PASSPORT_RENEWAL_PHOTO_SPECS;
  const w = width;
  const h = height;
  const tol = S.squareTolerancePx;
  const square = w > 0 && h > 0 && Math.abs(w - h) <= tol;
  const minB = S.minSizeKB * 1024;
  const maxB = S.maxSizeKB * 1024;
  return {
    square,
    minDim: w >= S.minWidth && h >= S.minHeight,
    maxDim: w <= S.maxWidth && h <= S.maxHeight,
    byteRangeOk:
      fileSizeBytes >= minB && fileSizeBytes <= maxB && fileSizeBytes > 0,
  };
}

export async function evaluatePassportRenewalPhotoExportBlob(
  blob: Blob,
  width: number,
  height: number
): Promise<PassportRenewalPhotoExportChecks> {
  const base = evaluatePassportRenewalPhotoDimensionsAndSize(
    width,
    height,
    blob.size
  );
  const jpeg =
    ociApplicantPhotoMimeLooksJpeg(blob.type) ||
    (await ociApplicantPhotoBlobHasJpegMagic(blob));
  return { ...base, jpeg };
}

/** Auto-checks only; white background is confirmed separately in the UI. */
export function allPassportRenewalPhotoAutoChecksPass(
  c: PassportRenewalPhotoExportChecks | null
): boolean {
  if (!c) return false;
  return c.square && c.minDim && c.maxDim && c.byteRangeOk && c.jpeg;
}
