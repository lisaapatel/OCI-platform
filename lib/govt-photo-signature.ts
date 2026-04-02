import sharp from "sharp";

import {
  OCI_APPLICANT_PHOTO_MAX_PX,
  OCI_APPLICANT_PHOTO_MIN_PX,
  OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX,
} from "@/lib/oci-applicant-photo-rules";
import {
  PORTAL_IMAGE_MAX_BYTES,
  PORTAL_IMAGE_MAX_KB,
} from "@/lib/portal-constants";

/** @deprecated Use PORTAL_IMAGE_MAX_BYTES from portal-constants */
export const GOVT_IMAGE_MAX_BYTES = PORTAL_IMAGE_MAX_BYTES;

export type GovtImageType = "photo" | "signature";

/** Signature: JPEG, 3:1 width:height, min 200×67, max 1500×500. */
const SIG_RATIO = 3;
const SIG_RATIO_TOL = 0.06;
const SIG_W_MIN = 200;
const SIG_W_MAX = 1500;
const SIG_H_MIN = 67;
const SIG_H_MAX = 500;

export type GovtImageValidation = {
  valid: boolean;
  issues: string[];
  current_size_kb: number;
  current_dimensions: string;
  current_format: string;
};

function kb(bytes: number): number {
  return Math.round((bytes / 1024) * 100) / 100;
}

function formatLabel(fmt: string | undefined): string {
  if (!fmt) return "unknown";
  if (fmt === "jpeg") return "JPEG";
  if (fmt === "png") return "PNG";
  if (fmt === "webp") return "WebP";
  return fmt;
}

export async function validateGovtImage(
  buffer: Buffer,
  imageType: GovtImageType
): Promise<GovtImageValidation> {
  const issues: string[] = [];
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { failOn: "none" }).metadata();
  } catch {
    return {
      valid: false,
      issues: ["Could not read image file."],
      current_size_kb: kb(buffer.length),
      current_dimensions: "—",
      current_format: "unknown",
    };
  }

  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const fmt = meta.format;
  const dimStr = w && h ? `${w}×${h}px` : "—";
  const sizeKb = kb(buffer.length);

  if (fmt && fmt !== "jpeg") {
    issues.push(
      `Format is ${formatLabel(fmt)}; govt portal requires JPG/JPEG only.`
    );
  }

  if (buffer.length > PORTAL_IMAGE_MAX_BYTES) {
    issues.push(
      `File is ${sizeKb}KB; must be at most ${PORTAL_IMAGE_MAX_KB}KB (${PORTAL_IMAGE_MAX_BYTES} bytes) for govt portal.`
    );
  }

  if (!w || !h) {
    issues.push("Could not determine image dimensions.");
  } else if (imageType === "photo") {
    if (Math.abs(w - h) > OCI_APPLICANT_PHOTO_SQUARE_TOLERANCE_PX) {
      issues.push(`Not square: ${w}×${h} (width and height must be equal).`);
    }
    if (w < OCI_APPLICANT_PHOTO_MIN_PX || h < OCI_APPLICANT_PHOTO_MIN_PX) {
      issues.push(
        `Dimensions below minimum: need at least ${OCI_APPLICANT_PHOTO_MIN_PX}×${OCI_APPLICANT_PHOTO_MIN_PX}px.`
      );
    }
    if (w > OCI_APPLICANT_PHOTO_MAX_PX || h > OCI_APPLICANT_PHOTO_MAX_PX) {
      issues.push(
        `Dimensions above maximum: at most ${OCI_APPLICANT_PHOTO_MAX_PX}×${OCI_APPLICANT_PHOTO_MAX_PX}px.`
      );
    }
  } else {
    const ratio = w / h;
    if (Math.abs(ratio - SIG_RATIO) > SIG_RATIO_TOL) {
      issues.push(
        `Aspect ratio is ${(w / h).toFixed(2)}:1 (width:height); OCI portal expects 3:1 within ${SIG_W_MIN}×${SIG_H_MIN}–${SIG_W_MAX}×${SIG_H_MAX}px (e.g. 600×200).`
      );
    }
    if (w < SIG_W_MIN || h < SIG_H_MIN) {
      issues.push(
        `Below minimum size: at least ${SIG_W_MIN}×${SIG_H_MIN}px (wide signature).`
      );
    }
    if (w > SIG_W_MAX || h > SIG_H_MAX) {
      issues.push(
        `Above maximum size: at most ${SIG_W_MAX}×${SIG_H_MAX}px.`
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    current_size_kb: sizeKb,
    current_dimensions: dimStr,
    current_format: formatLabel(fmt),
  };
}

async function jpegUnderLimit(
  build: () => sharp.Sharp,
  maxBytes: number
): Promise<{ buffer: Buffer; width: number; height: number }> {
  let quality = 82;
  let last: Buffer | null = null;
  let lastW = 0;
  let lastH = 0;
  for (let i = 0; i < 18; i++) {
    const buf = await build()
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    last = buf.data;
    lastW = buf.info.width;
    lastH = buf.info.height;
    if (buf.data.length <= maxBytes) {
      return { buffer: buf.data, width: lastW, height: lastH };
    }
    quality -= 5;
    if (quality < 28) quality = 28;
  }
  if (last && last.length <= maxBytes * 1.02) {
    return { buffer: last, width: lastW, height: lastH };
  }
  throw new Error(
    `Could not compress under ${kb(maxBytes)}KB (got ${last ? kb(last.length) : 0}KB).`
  );
}

/**
 * Crop editor / auto-fix target: 600×600px square JPEG under 500KB
 * (PORTAL_IMAGE_MAX_BYTES).
 */
export async function fixGovtPhoto(buffer: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const base = sharp(buffer).rotate();
  const meta = await base.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("Invalid image dimensions.");

  const side = Math.min(w, h);
  const left = Math.floor((w - side) / 2);
  const top = Math.floor((h - side) / 2);

  return jpegUnderLimit(
    () =>
      sharp(buffer)
        .rotate()
        .extract({ left, top, width: side, height: side })
        .resize(600, 600, { fit: "fill" }),
    PORTAL_IMAGE_MAX_BYTES
  );
}

/**
 * Crop editor / auto-fix target: 600×200px (3:1) JPEG under 500KB
 * (PORTAL_IMAGE_MAX_BYTES).
 */
export async function fixGovtSignature(buffer: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  return jpegUnderLimit(
    () =>
      sharp(buffer)
        .rotate()
        .resize(600, 200, { fit: "cover", position: "centre" }),
    PORTAL_IMAGE_MAX_BYTES
  );
}

export async function fixGovtImage(
  buffer: Buffer,
  imageType: GovtImageType
): Promise<{ buffer: Buffer; width: number; height: number }> {
  if (imageType === "photo") return fixGovtPhoto(buffer);
  return fixGovtSignature(buffer);
}
