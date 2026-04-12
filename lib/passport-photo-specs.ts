import {
  ociApplicantPhotoBlobHasJpegMagic,
  ociApplicantPhotoMimeLooksJpeg,
} from "@/lib/oci-applicant-photo-rules";

/** VFS / passport-style photo constraints (crop editor + validation). */
export const PASSPORT_RENEWAL_PHOTO_SPECS = {
  format: "image/jpeg" as const,
  widthPx: 630,
  heightPx: 810,
  aspectRatio: { width: 7, height: 9 },
  maxSizeKB: 250,
  backgroundNote: "Plain white background required",
  faceCoverageNote: "Face should fill about 80% of photo",
} as const;

/** Fixed export size required by Indian passport renewal flow. */
export const PASSPORT_RENEWAL_EXPORT_WIDTH_PX =
  PASSPORT_RENEWAL_PHOTO_SPECS.widthPx;
export const PASSPORT_RENEWAL_EXPORT_HEIGHT_PX =
  PASSPORT_RENEWAL_PHOTO_SPECS.heightPx;

export type PassportRenewalPhotoExportChecks = {
  exactDimensions: boolean;
  maxSizeOk: boolean;
  jpeg: boolean;
};

export function evaluatePassportRenewalPhotoDimensionsAndSize(
  width: number,
  height: number,
  fileSizeBytes: number
): Pick<
  PassportRenewalPhotoExportChecks,
  "exactDimensions" | "maxSizeOk"
> {
  const S = PASSPORT_RENEWAL_PHOTO_SPECS;
  const w = width;
  const h = height;
  const maxB = S.maxSizeKB * 1024;
  return {
    exactDimensions: w === S.widthPx && h === S.heightPx,
    maxSizeOk: fileSizeBytes > 0 && fileSizeBytes <= maxB,
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
  return c.exactDimensions && c.maxSizeOk && c.jpeg;
}
