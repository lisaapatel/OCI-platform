/**
 * OCI applicant photo rules (ociservices.gov.in) — shared by server validation
 * and the crop editor preview so “Meets OCI requirements” matches /api validation.
 */

import { PORTAL_IMAGE_MAX_BYTES } from "@/lib/portal-constants";

export const OCI_APPLICANT_PHOTO_MIN_PX = 200;
export const OCI_APPLICANT_PHOTO_MAX_PX = 1500;
/** Same tolerance as validateGovtImage (sharp): |w−h| ≤ 2 counts as square. */
export const OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX = 2;

export type OciApplicantPhotoExportChecks = {
  square: boolean;
  minDim: boolean;
  maxDim: boolean;
  underByteLimit: boolean;
  jpeg: boolean;
};

export function evaluateOciApplicantPhotoDimensionsAndSize(
  width: number,
  height: number,
  fileSizeBytes: number
): Pick<
  OciApplicantPhotoExportChecks,
  "square" | "minDim" | "maxDim" | "underByteLimit"
> {
  const w = width;
  const h = height;
  const square =
    w > 0 &&
    h > 0 &&
    Math.abs(w - h) <= OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX;
  return {
    square,
    minDim:
      w >= OCI_APPLICANT_PHOTO_MIN_PX && h >= OCI_APPLICANT_PHOTO_MIN_PX,
    maxDim:
      w <= OCI_APPLICANT_PHOTO_MAX_PX && h <= OCI_APPLICANT_PHOTO_MAX_PX,
    underByteLimit:
      fileSizeBytes > 0 && fileSizeBytes <= PORTAL_IMAGE_MAX_BYTES,
  };
}

export function ociApplicantPhotoMimeLooksJpeg(mime: string | undefined): boolean {
  const m = (mime ?? "").toLowerCase();
  return m === "image/jpeg" || m === "image/jpg";
}

/** SOI marker — matches server reading JPEG from buffer. */
export async function ociApplicantPhotoBlobHasJpegMagic(blob: Blob): Promise<boolean> {
  const buf = await blob.slice(0, 2).arrayBuffer();
  const u = new Uint8Array(buf);
  return u.length >= 2 && u[0] === 0xff && u[1] === 0xd8;
}

export async function evaluateOciApplicantPhotoExportBlob(
  blob: Blob,
  width: number,
  height: number
): Promise<OciApplicantPhotoExportChecks> {
  const base = evaluateOciApplicantPhotoDimensionsAndSize(
    width,
    height,
    blob.size
  );
  const jpeg =
    ociApplicantPhotoMimeLooksJpeg(blob.type) ||
    (await ociApplicantPhotoBlobHasJpegMagic(blob));
  return { ...base, jpeg };
}

export function allOciApplicantPhotoChecksPass(
  c: OciApplicantPhotoExportChecks | null
): boolean {
  if (!c) return false;
  return (
    c.square &&
    c.minDim &&
    c.maxDim &&
    c.underByteLimit &&
    c.jpeg
  );
}
