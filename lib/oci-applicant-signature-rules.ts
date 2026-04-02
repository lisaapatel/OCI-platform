/**
 * OCI applicant signature rules (ociservices.gov.in) — shared by the client crop editor
 * and matched to server validation in `lib/govt-photo-signature.ts`.
 */

import { PORTAL_IMAGE_MAX_BYTES } from "@/lib/portal-constants";

export const OCI_APPLICANT_SIGNATURE_MIN_WIDTH_PX = 200;
export const OCI_APPLICANT_SIGNATURE_MIN_HEIGHT_PX = 67;
export const OCI_APPLICANT_SIGNATURE_MAX_WIDTH_PX = 1500;
export const OCI_APPLICANT_SIGNATURE_MAX_HEIGHT_PX = 500;

/** Signature requires 3:1 width:height (w/h). */
const SIG_RATIO = 3;
/** ±2% tolerance in terms of ratio magnitude. */
const SIG_RATIO_TOL = SIG_RATIO * 0.02; // 0.06

export type OciApplicantSignatureExportChecks = {
  ratio: boolean;
  minDim: boolean;
  maxDim: boolean;
  underByteLimit: boolean;
  jpeg: boolean;
};

export function evaluateOciApplicantSignatureDimensionsAndSize(
  width: number,
  height: number,
  fileSizeBytes: number
): Pick<
  OciApplicantSignatureExportChecks,
  "ratio" | "minDim" | "maxDim" | "underByteLimit"
> {
  const w = width;
  const h = height;
  const ratio = h > 0 ? w / h : 0;
  const ratioOk = w > 0 && h > 0 && Math.abs(ratio - SIG_RATIO) <= SIG_RATIO_TOL;

  return {
    ratio: ratioOk,
    minDim: w >= OCI_APPLICANT_SIGNATURE_MIN_WIDTH_PX && h >= OCI_APPLICANT_SIGNATURE_MIN_HEIGHT_PX,
    maxDim:
      w <= OCI_APPLICANT_SIGNATURE_MAX_WIDTH_PX &&
      h <= OCI_APPLICANT_SIGNATURE_MAX_HEIGHT_PX,
    underByteLimit:
      fileSizeBytes > 0 && fileSizeBytes <= PORTAL_IMAGE_MAX_BYTES,
  };
}

export function ociApplicantSignatureMimeLooksJpeg(
  mime: string | undefined
): boolean {
  const m = (mime ?? "").toLowerCase();
  return m === "image/jpeg" || m === "image/jpg";
}

/** SOI marker — matches server reading JPEG from buffer. */
export async function ociApplicantSignatureBlobHasJpegMagic(
  blob: Blob
): Promise<boolean> {
  const buf = await blob.slice(0, 2).arrayBuffer();
  const u = new Uint8Array(buf);
  return u.length >= 2 && u[0] === 0xff && u[1] === 0xd8;
}

export async function evaluateOciApplicantSignatureExportBlob(
  blob: Blob,
  width: number,
  height: number
): Promise<OciApplicantSignatureExportChecks> {
  const base = evaluateOciApplicantSignatureDimensionsAndSize(
    width,
    height,
    blob.size
  );
  const jpeg =
    ociApplicantSignatureMimeLooksJpeg(blob.type) ||
    (await ociApplicantSignatureBlobHasJpegMagic(blob));
  return { ...base, jpeg };
}

export function allOciApplicantSignatureChecksPass(
  c: OciApplicantSignatureExportChecks | null
): boolean {
  if (!c) return false;
  return (
    c.ratio &&
    c.minDim &&
    c.maxDim &&
    c.underByteLimit &&
    c.jpeg
  );
}

