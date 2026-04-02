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

export const SIGNATURE_SPECS = {
  /** Sharp metadata reports `jpeg` for JPG/JPEG. */
  format: "image/jpeg",
  maxSizeKB: PORTAL_IMAGE_MAX_KB,
  /** 3:1 width:height */
  aspectRatio: { width: 3, height: 1 },
  /** abs(actualRatio-expectedRatio)/expectedRatio <= 0.02 (±2%). */
  ratioTolerancePct: 0.02,
  minWidth: 200,
  minHeight: 67,
  maxWidth: 1500,
  maxHeight: 500,
} as const;

export type GovtImageValidation = {
  valid: boolean;
  issues: string[];
  current_size_kb: number;
  current_dimensions: string;
  current_format: string;
  checks?: { rule: string; passed: boolean }[];
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

function computeGovtSignatureChecks(params: {
  width: number;
  height: number;
  format: string | undefined;
  fileSizeBytes: number;
}): { rule: string; passed: boolean }[] {
  const { width: w, height: h, format: fmt, fileSizeBytes } = params;

  const jpegPassed = fmt === "jpeg";

  const expectedRatio =
    SIGNATURE_SPECS.aspectRatio.width / SIGNATURE_SPECS.aspectRatio.height;
  const ratioPassed =
    w > 0 &&
    h > 0 &&
    Math.abs(w / h - expectedRatio) / expectedRatio <=
      SIGNATURE_SPECS.ratioTolerancePct;

  const minPassed =
    w >= SIGNATURE_SPECS.minWidth && h >= SIGNATURE_SPECS.minHeight;
  const maxPassed =
    w <= SIGNATURE_SPECS.maxWidth && h <= SIGNATURE_SPECS.maxHeight;
  const underByteLimitPassed = fileSizeBytes <= PORTAL_IMAGE_MAX_BYTES;

  return [
    { rule: "3:1 ratio", passed: ratioPassed },
    {
      rule: `Min ${SIGNATURE_SPECS.minWidth}\u00d7${SIGNATURE_SPECS.minHeight}`,
      passed: minPassed,
    },
    {
      rule: `Max ${SIGNATURE_SPECS.maxWidth}\u00d7${SIGNATURE_SPECS.maxHeight}`,
      passed: maxPassed,
    },
    {
      rule: `Under ${SIGNATURE_SPECS.maxSizeKB}KB`,
      passed: underByteLimitPassed,
    },
    { rule: "JPEG format", passed: jpegPassed },
  ];
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

  if (fmt !== "jpeg") {
    issues.push(
      `Format is ${formatLabel(fmt)}; govt portal requires JPG/JPEG only.`
    );
  }

  const signatureChecks = computeGovtSignatureChecks({
    width: w,
    height: h,
    format: fmt,
    fileSizeBytes: buffer.length,
  });

  const ratioOk = signatureChecks[0]!.passed;
  const minOk = signatureChecks[1]!.passed;
  const maxOk = signatureChecks[2]!.passed;

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
    if (!ratioOk) {
      issues.push(
        `Aspect ratio is ${(w / h).toFixed(2)}:1 (width:height); OCI portal expects 3:1 within ±${Math.round(
          SIGNATURE_SPECS.ratioTolerancePct * 100
        )}% (e.g. 600×200).`
      );
    }
    if (!minOk) {
      issues.push(
        `Below minimum size: at least ${SIGNATURE_SPECS.minWidth}\u00d7${SIGNATURE_SPECS.minHeight}px (wide signature).`
      );
    }
    if (!maxOk) {
      issues.push(
        `Above maximum size: at most ${SIGNATURE_SPECS.maxWidth}\u00d7${SIGNATURE_SPECS.maxHeight}px.`
      );
    }
  }

  return {
    valid:
      imageType === "signature"
        ? signatureChecks.every((c) => c.passed)
        : issues.length === 0,
    issues,
    current_size_kb: sizeKb,
    current_dimensions: dimStr,
    current_format: formatLabel(fmt),
    checks: imageType === "signature" ? signatureChecks : undefined,
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
