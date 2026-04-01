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

function sharpPdfDecodeLikelyUnsupported(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("unsupported image format") ||
    m.includes("input buffer contains unsupported") ||
    m.includes("poppler") ||
    m.includes("libvips")
  );
}

/** Uses libvips PDF support (Poppler). Fast when available. */
async function rasterizePdfToJpegPdfWithSharp(
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

/** Avoid huge canvases (memory / timeouts) on large or high-DPI pages. */
const PDFJS_MAX_RASTER_EDGE_PX = 2400;

type PdfjsGlobal = typeof globalThis & {
  pdfjsWorker?: { WorkerMessageHandler: unknown };
};

/**
 * pdf.js in Node uses a "fake worker" that dynamic-imports `./pdf.worker.mjs` relative to
 * `pdf.mjs`. That breaks on Lambda / standalone when the subpath is missing or not resolvable.
 * Registering `WorkerMessageHandler` on `globalThis.pdfjsWorker` skips that import (see pdf.js
 * `PDFWorker._setupFakeWorkerGlobal`).
 */
async function ensurePdfjsMainThreadWorker(): Promise<void> {
  const g = globalThis as PdfjsGlobal;
  if (g.pdfjsWorker?.WorkerMessageHandler) return;

  const workerMod = (await import(
    "pdfjs-dist/legacy/build/pdf.worker.mjs"
  )) as { WorkerMessageHandler: unknown };
  if (!workerMod.WorkerMessageHandler) {
    throw new Error("pdf.worker.mjs did not export WorkerMessageHandler.");
  }
  g.pdfjsWorker = { WorkerMessageHandler: workerMod.WorkerMessageHandler };
}

/**
 * pdf.js + Skia canvas — works when Sharp is built without PDF/Poppler (default on many installs).
 */
async function rasterizePdfToJpegPdfWithPdfJs(
  pdfBuffer: Buffer,
  density: number,
  jpegQuality: number
): Promise<Buffer> {
  await ensurePdfjsMainThreadWorker();

  const [{ getDocument }, { createCanvas }] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("@napi-rs/canvas"),
  ]);

  const data = new Uint8Array(pdfBuffer.length);
  data.set(pdfBuffer);

  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
    verbosity: 0,
  });

  const outDoc = await PDFDocument.create();
  let pdf: Awaited<(typeof loadingTask)["promise"]> | null = null;

  try {
    pdf = await loadingTask.promise;
    const baseScale = density / 72;

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex);
      try {
        let viewport = page.getViewport({ scale: baseScale });
        const maxDim = Math.max(viewport.width, viewport.height);
        if (maxDim > PDFJS_MAX_RASTER_EDGE_PX) {
          viewport = page.getViewport({
            scale: (baseScale * PDFJS_MAX_RASTER_EDGE_PX) / maxDim,
          });
        }

        const w = Math.max(1, Math.floor(viewport.width));
        const h = Math.max(1, Math.floor(viewport.height));
        const canvas = createCanvas(w, h);
        const ctx = canvas.getContext("2d");

        await page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        // PNG first — @napi-rs/canvas JPEG is not always readable by Sharp/pdf-lib ("SOI not found").
        const pngBuf = canvas.toBuffer("image/png");
        const jpegData = await sharp(pngBuf)
          .jpeg({ quality: jpegQuality, mozjpeg: true })
          .toBuffer();
        const meta = await sharp(jpegData).metadata();
        const pw = meta.width ?? w;
        const ph = meta.height ?? h;
        const jpg = await outDoc.embedJpg(jpegData);
        const outPage = outDoc.addPage([pw, ph]);
        outPage.drawImage(jpg, { x: 0, y: 0, width: pw, height: ph });
      } finally {
        page.cleanup();
      }
    }

    return Buffer.from(await outDoc.save({ useObjectStreams: true }));
  } finally {
    try {
      await pdf?.destroy();
    } catch {
      /* ignore teardown errors */
    }
    try {
      await loadingTask.destroy();
    } catch {
      /* ignore */
    }
  }
}

type PdfRasterBackendState = { preferPdfJs: boolean };

/**
 * Rasterize for portal: Sharp when libvips has PDF support, else pdf.js once per compress session.
 * Updates `state.preferPdfJs` so multi-attempt loops do not re-hit failing Sharp PDF on every iteration.
 */
async function rasterizePdfToJpegPdfAdaptive(
  pdfBuffer: Buffer,
  density: number,
  jpegQuality: number,
  state: PdfRasterBackendState
): Promise<Buffer> {
  if (state.preferPdfJs) {
    return rasterizePdfToJpegPdfWithPdfJs(pdfBuffer, density, jpegQuality);
  }

  try {
    return await rasterizePdfToJpegPdfWithSharp(pdfBuffer, density, jpegQuality);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!sharpPdfDecodeLikelyUnsupported(msg)) {
      throw err;
    }
    try {
      state.preferPdfJs = true;
      return await rasterizePdfToJpegPdfWithPdfJs(
        pdfBuffer,
        density,
        jpegQuality
      );
    } catch (fallbackErr) {
      const fb =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(
        `PDF rasterize failed (Sharp PDF unsupported and pdf.js fallback failed): ${fb}`
      );
    }
  }
}

export async function compressPdfForPortal(
  pdfBuffer: Buffer,
  maxBytes: number = PORTAL_MAX_BYTES
): Promise<Buffer> {
  let density = 72;
  let quality = 68;
  let last: Buffer | null = null;
  const rasterState: PdfRasterBackendState = { preferPdfJs: false };

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      last = await rasterizePdfToJpegPdfAdaptive(
        pdfBuffer,
        density,
        quality,
        rasterState
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`PDF compress failed: ${msg}`);
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
