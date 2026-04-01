import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { PORTAL_MAX_BYTES } from "@/lib/portal-constants";

export { PORTAL_MAX_BYTES } from "@/lib/portal-constants";

function bytesToKb(n: number): number {
  return Math.round((n / 1024) * 10) / 10;
}

export function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-";
}

export function isLikelyImageBuffer(buf: Buffer, mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return true;
  if (m.includes("png")) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return true;
  return false;
}

async function rasterizePdfToJpegPdf(
  pdfBuffer: Buffer,
  density: number,
  jpegQuality: number
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pageCount = srcDoc.getPageCount();
  const outDoc = await PDFDocument.create();

  for (let i = 0; i < pageCount; i++) {
    const jpegData = await sharp(pdfBuffer, {
      density,
      page: i,
      limitInputPixels: false,
      failOn: "none",
    })
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toBuffer();

    const meta = await sharp(jpegData).metadata();
    const w = meta.width ?? 612;
    const h = meta.height ?? 792;
    const jpg = await outDoc.embedJpg(jpegData);
    const page = outDoc.addPage([w, h]);
    page.drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }

  return Buffer.from(await outDoc.save({ useObjectStreams: true }));
}

export async function compressPdfForPortal(
  pdfBuffer: Buffer,
  maxBytes: number = PORTAL_MAX_BYTES
): Promise<Buffer> {
  let density = 72;
  let quality = 68;
  let last: Buffer | null = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      last = await rasterizePdfToJpegPdf(pdfBuffer, density, quality);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `PDF rasterize/compress failed (is libvips built with PDF/poppler support?): ${msg}`
      );
    }
    if (last.length <= maxBytes) return last;
    quality -= 8;
    if (quality < 32) {
      quality = 60;
      density = Math.max(40, density - 10);
    }
  }

  if (last && last.length <= PORTAL_MAX_BYTES * 1.05) {
    return last;
  }

  throw new Error(
    `Could not compress PDF under ${bytesToKb(maxBytes)}KB (got ${bytesToKb(last?.length ?? 0)}KB). Try splitting the document.`
  );
}

export async function compressImageForPortal(
  imageBuffer: Buffer,
  maxBytes: number = PORTAL_MAX_BYTES
): Promise<Buffer> {
  let quality = 82;
  let width: number | undefined;

  for (let attempt = 0; attempt < 14; attempt++) {
    let pipeline = sharp(imageBuffer).rotate();
    if (width) {
      pipeline = pipeline.resize({
        width,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const out = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= maxBytes) return out;
    quality -= 7;
    if (quality < 28) {
      quality = 72;
      width = width ? Math.round(width * 0.82) : 1600;
    }
  }

  throw new Error(
    `Could not compress image under ${bytesToKb(maxBytes)}KB after multiple attempts.`
  );
}

export type CompressInputKind = "pdf" | "image" | "unknown";

export function classifyForCompression(
  buffer: Buffer,
  mimeType: string
): CompressInputKind {
  if (mimeType.includes("pdf") || isPdfBuffer(buffer)) return "pdf";
  if (isLikelyImageBuffer(buffer, mimeType)) return "image";
  return "unknown";
}

export async function compressForGovtPortal(
  buffer: Buffer,
  mimeType: string,
  targetBytes: number
): Promise<{ output: Buffer; outputMime: string }> {
  const kind = classifyForCompression(buffer, mimeType);
  if (kind === "pdf") {
    const out = await compressPdfForPortal(buffer, targetBytes);
    return { output: out, outputMime: "application/pdf" };
  }
  if (kind === "image") {
    const out = await compressImageForPortal(buffer, targetBytes);
    return { output: out, outputMime: "image/jpeg" };
  }
  throw new Error(
    "Unsupported file type for compression. Use PDF, JPEG, or PNG."
  );
}
