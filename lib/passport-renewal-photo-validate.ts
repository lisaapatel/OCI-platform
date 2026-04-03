import sharp from "sharp";

import {
  PASSPORT_RENEWAL_EXPORT_PX,
  PASSPORT_RENEWAL_PHOTO_SPECS,
  evaluatePassportRenewalPhotoDimensionsAndSize,
} from "@/lib/passport-photo-specs";
import type { GovtImageValidation } from "@/lib/govt-photo-signature";

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

/** Server-side validation for passport renewal applicant photo (VFS-oriented limits). */
export async function validatePassportRenewalPhoto(
  buffer: Buffer
): Promise<GovtImageValidation> {
  const S = PASSPORT_RENEWAL_PHOTO_SPECS;
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
      `Format is ${formatLabel(fmt)}; passport upload requires JPG/JPEG only.`
    );
  }

  const dimChecks = evaluatePassportRenewalPhotoDimensionsAndSize(
    w,
    h,
    buffer.length
  );

  const checks = [
    {
      rule: `Square 1:1 (±${S.squareTolerancePx}px)`,
      passed: dimChecks.square,
    },
    {
      rule: `Min ${S.minWidth}×${S.minHeight}px`,
      passed: dimChecks.minDim,
    },
    {
      rule: `Max ${S.maxWidth}×${S.maxHeight}px`,
      passed: dimChecks.maxDim,
    },
    {
      rule: `File size ${S.minSizeKB}–${S.maxSizeKB}KB`,
      passed: dimChecks.byteRangeOk,
    },
    { rule: "JPEG format", passed: fmt === "jpeg" },
  ];

  if (!dimChecks.square) {
    issues.push(`Not square: ${w}×${h} (width and height must be equal within ±${S.squareTolerancePx}px).`);
  }
  if (!dimChecks.minDim) {
    issues.push(
      `Dimensions below minimum: need at least ${S.minWidth}×${S.minHeight}px.`
    );
  }
  if (!dimChecks.maxDim) {
    issues.push(
      `Dimensions above maximum: at most ${S.maxWidth}×${S.maxHeight}px.`
    );
  }
  if (buffer.length < S.minSizeKB * 1024) {
    issues.push(
      `File is ${sizeKb}KB; VFS-style target is at least ${S.minSizeKB}KB (increase quality or crop).`
    );
  }
  if (buffer.length > S.maxSizeKB * 1024) {
    issues.push(
      `File is ${sizeKb}KB; must be at most ${S.maxSizeKB}KB.`
    );
  }

  return {
    valid: checks.every((c) => c.passed),
    issues,
    current_size_kb: sizeKb,
    current_dimensions: dimStr,
    current_format: formatLabel(fmt),
    checks,
  };
}

/** Auto-fix uploaded photo: square crop, resize to export px, JPEG within passport byte range. */
export async function fixPassportRenewalPhotoFromBuffer(buffer: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const S = PASSPORT_RENEWAL_PHOTO_SPECS;
  const maxB = S.maxSizeKB * 1024;
  const minB = S.minSizeKB * 1024;
  const base = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("Invalid image dimensions.");

  const side = Math.min(w, h);
  const left = Math.floor((w - side) / 2);
  const top = Math.floor((h - side) / 2);

  let quality = 88;
  let last: Buffer | null = null;
  let lastW = 0;
  let lastH = 0;
  for (let i = 0; i < 22; i++) {
    const { data, info } = await sharp(buffer, { failOn: "none" })
      .rotate()
      .extract({ left, top, width: side, height: side })
      .resize(PASSPORT_RENEWAL_EXPORT_PX, PASSPORT_RENEWAL_EXPORT_PX, {
        fit: "fill",
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    last = data;
    lastW = info.width;
    lastH = info.height;
    if (data.length <= maxB && data.length >= minB) {
      return { buffer: data, width: lastW, height: lastH };
    }
    if (data.length > maxB) quality -= 4;
    else quality += 3;
    quality = Math.max(28, Math.min(95, quality));
  }
  if (last && last.length <= maxB) {
    return { buffer: last, width: lastW, height: lastH };
  }
  throw new Error(
    `Could not produce JPEG between ${S.minSizeKB}KB and ${S.maxSizeKB}KB.`
  );
}
