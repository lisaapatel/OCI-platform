import sharp from "sharp";

/**
 * Applicant photo/signature HEIC→JPEG conversion failed (e.g. corrupt file or
 * Sharp built without libheif). Map to HTTP 400 in the upload route.
 */
export class ApplicantImageNormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicantImageNormalizeError";
  }
}

function looksHeic(mime: string, fileName: string): boolean {
  const m = mime.toLowerCase().trim();
  if (m === "image/heic" || m === "image/heif") return true;
  const lower = fileName.toLowerCase();
  return lower.endsWith(".heic") || lower.endsWith(".heif");
}

function stemWithJpg(fileName: string): string {
  const base = fileName.trim().replace(/\\/g, "/").split("/").pop() || "image";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const safe = stem.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "image";
  return `${safe}.jpg`;
}

/**
 * If the upload looks like HEIC/HEIF, decode with Sharp and emit JPEG.
 * Otherwise returns the input unchanged (same buffer reference).
 *
 * HEIC decode needs libvips with libheif in the deployment image.
 */
export async function normalizeHeicApplicantImageUpload(input: {
  buffer: Buffer;
  mimeType: string;
  clientFileName: string;
}): Promise<{ buffer: Buffer; mimeType: string; clientFileName: string }> {
  const { buffer, mimeType, clientFileName } = input;
  if (!looksHeic(mimeType, clientFileName)) {
    return { buffer, mimeType, clientFileName };
  }
  try {
    const out = await sharp(buffer, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 90 })
      .toBuffer();
    return {
      buffer: out,
      mimeType: "image/jpeg",
      clientFileName: stemWithJpg(clientFileName),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApplicantImageNormalizeError(
      `Could not read image; try exporting as JPEG. ${msg.slice(0, 160)}`
    );
  }
}
