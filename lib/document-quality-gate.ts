import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

export type DocumentQualityStatus =
  | "ok"
  | "warning"
  | "manual_review_recommended"
  | "unprocessable";

export type DocumentQualityIssue =
  | "decode_failed"
  | "low_resolution"
  | "likely_blank"
  | "low_text_density_hint"
  | "exif_rotation_suspected"
  | "pdf_page_count_high"
  | "pdf_zero_pages";

export type DocumentQualityResult = {
  status: DocumentQualityStatus;
  issues: DocumentQualityIssue[];
  suggestedRotation?: 0 | 90 | 180 | 270;
  details?: {
    width?: number;
    height?: number;
    pageCount?: number;
    exifOrientation?: number;
    analyzedAt: string;
  };
};

const MIN_LONG_EDGE_PX = 800;
const MIN_MEGAPIXELS = 0.35;
const PDF_PAGE_WARN_THRESHOLD = 15;

/** EXIF orientation values that imply the file should be rotated for normal viewing. */
function orientationToSuggestedRotation(
  o: number | undefined
): 0 | 90 | 180 | 270 | undefined {
  if (o == null) return undefined;
  switch (o) {
    case 3:
      return 180;
    case 6:
      return 90;
    case 8:
      return 270;
    default:
      return undefined;
  }
}

function aggregateStatus(issues: DocumentQualityIssue[]): DocumentQualityStatus {
  if (issues.includes("decode_failed")) return "unprocessable";
  if (
    issues.includes("likely_blank") ||
    issues.includes("pdf_zero_pages")
  ) {
    return "manual_review_recommended";
  }
  if (issues.length > 0) return "warning";
  return "ok";
}

function isProbablyPdf(mimeType: string, fileName?: string): boolean {
  const m = mimeType.toLowerCase();
  if (m.includes("pdf")) return true;
  const n = (fileName ?? "").toLowerCase();
  return n.endsWith(".pdf");
}

function isProbablyRasterImage(mimeType: string, fileName?: string): boolean {
  const m = mimeType.toLowerCase();
  if (
    m.startsWith("image/") &&
    !m.includes("svg") &&
    !m.includes("heic") &&
    !m.includes("heif")
  ) {
    return true;
  }
  const n = (fileName ?? "").toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"].some(
    (ext) => n.endsWith(ext)
  );
}

async function analyzeRasterImage(buffer: Buffer): Promise<{
  issues: DocumentQualityIssue[];
  details: DocumentQualityResult["details"];
  suggestedRotation?: 0 | 90 | 180 | 270;
}> {
  const issues: DocumentQualityIssue[] = [];
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return {
      issues: ["decode_failed"],
      details: { analyzedAt: new Date().toISOString() },
    };
  }

  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const longEdge = Math.max(w, h);
  const mp = (w * h) / 1_000_000;

  if (
    (longEdge > 0 && longEdge < MIN_LONG_EDGE_PX) ||
    (mp > 0 && mp < MIN_MEGAPIXELS)
  ) {
    issues.push("low_resolution");
  }

  const o = meta.orientation;
  if (o != null && o !== 1) {
    issues.push("exif_rotation_suspected");
  }
  const suggestedRotation = orientationToSuggestedRotation(o);

  let stats: sharp.Stats;
  try {
    stats = await sharp(buffer)
      .rotate()
      .greyscale()
      .resize({ width: 160, height: 160, fit: "inside" })
      .stats();
  } catch {
    return {
      issues: [...issues, "decode_failed"],
      details: {
        width: w || undefined,
        height: h || undefined,
        exifOrientation: o,
        analyzedAt: new Date().toISOString(),
      },
      suggestedRotation,
    };
  }

  const ch = stats.channels[0];
  const mean = ch?.mean ?? 0;
  const stdev = ch?.stdev ?? 0;

  if (mean > 248 && stdev < 6) {
    issues.push("likely_blank");
  } else if (mean > 228 && stdev < 14 && !issues.includes("likely_blank")) {
    issues.push("low_text_density_hint");
  }

  try {
    const { data, info } = await sharp(buffer)
      .rotate()
      .greyscale()
      .resize({ width: 128, height: 128, fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w128 = info.width;
    const h128 = info.height;
    let sumGrad = 0;
    let nGrad = 0;
    for (let y = 1; y < h128 - 1; y++) {
      for (let x = 1; x < w128 - 1; x++) {
        const i = y * w128 + x;
        const c = data[i] ?? 0;
        const neighbors = [
          data[i - 1] ?? c,
          data[i + 1] ?? c,
          data[i - w128] ?? c,
          data[i + w128] ?? c,
        ];
        const localMean =
          neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
        sumGrad += Math.abs(c - localMean);
        nGrad += 1;
      }
    }
    const avgGrad = nGrad > 0 ? sumGrad / nGrad : 0;
    if (
      avgGrad < 2.5 &&
      !issues.includes("likely_blank") &&
      !issues.includes("low_text_density_hint")
    ) {
      issues.push("low_text_density_hint");
    }
  } catch {
    /* ignore gradient helper failure */
  }

  return {
    issues,
    details: {
      width: w || undefined,
      height: h || undefined,
      exifOrientation: o,
      analyzedAt: new Date().toISOString(),
    },
    suggestedRotation,
  };
}

async function analyzePdfBuffer(buffer: Buffer): Promise<{
  issues: DocumentQualityIssue[];
  details: DocumentQualityResult["details"];
}> {
  let pageCount = 0;
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    pageCount = doc.getPageCount();
  } catch {
    return {
      issues: ["decode_failed"],
      details: { analyzedAt: new Date().toISOString() },
    };
  }

  const issues: DocumentQualityIssue[] = [];
  if (pageCount === 0) {
    issues.push("pdf_zero_pages");
  }
  if (pageCount > PDF_PAGE_WARN_THRESHOLD) {
    issues.push("pdf_page_count_high");
  }

  return {
    issues,
    details: {
      pageCount,
      analyzedAt: new Date().toISOString(),
    },
  };
}

export type AnalyzeDocumentQualityInput = {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
};

/**
 * Lightweight pre-extraction quality hints. Advisory only — does not block extraction.
 */
export async function analyzeDocumentQuality(
  input: AnalyzeDocumentQualityInput
): Promise<DocumentQualityResult> {
  const { buffer, mimeType, fileName } = input;

  if (buffer.length === 0) {
    return {
      status: "unprocessable",
      issues: ["decode_failed"],
      details: { analyzedAt: new Date().toISOString() },
    };
  }

  if (isProbablyPdf(mimeType, fileName)) {
    const { issues, details } = await analyzePdfBuffer(buffer);
    return {
      status: aggregateStatus(issues),
      issues,
      details,
    };
  }

  if (isProbablyRasterImage(mimeType, fileName)) {
    const { issues, details, suggestedRotation } =
      await analyzeRasterImage(buffer);
    const status = aggregateStatus(issues);
    const out: DocumentQualityResult = {
      status,
      issues,
      details,
    };
    if (suggestedRotation != null && suggestedRotation !== 0) {
      out.suggestedRotation = suggestedRotation;
    }
    return out;
  }

  return {
    status: "ok",
    issues: [],
    details: { analyzedAt: new Date().toISOString() },
  };
}

/** Short user-facing summary for review UI. */
export function formatDocumentQualityHint(result: DocumentQualityResult): string {
  if (result.status === "ok") return "";
  const parts = result.issues.map((k) => {
    switch (k) {
      case "decode_failed":
        return "file could not be decoded";
      case "low_resolution":
        return "low resolution";
      case "likely_blank":
        return "likely blank or empty page";
      case "low_text_density_hint":
        return "low detail / faint scan";
      case "exif_rotation_suspected":
        return "rotation may be wrong (check EXIF)";
      case "pdf_page_count_high":
        return "many PDF pages";
      case "pdf_zero_pages":
        return "PDF has no pages";
      default:
        return k;
    }
  });
  const prefix =
    result.status === "unprocessable"
      ? "Quality"
      : result.status === "manual_review_recommended"
        ? "Quality — manual review recommended"
        : "Quality note";
  let s = `${prefix}: ${parts.join("; ")}`;
  if (result.suggestedRotation) {
    s += ` (suggested rotation: ${result.suggestedRotation}°)`;
  }
  return s;
}
