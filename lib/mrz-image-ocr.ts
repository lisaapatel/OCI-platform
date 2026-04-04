import { createWorker } from "tesseract.js";
import sharp from "sharp";

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-";
}

/** First page of PDF or full image as PNG for MRZ strip cropping. */
async function loadBiodataPagePng(
  buffer: Buffer,
  mimeType: string
): Promise<Buffer | null> {
  const mt = mimeType.trim().toLowerCase();
  try {
    if (mt.includes("pdf") || isPdfBuffer(buffer)) {
      return await sharp(buffer, {
        density: 200,
        page: 0,
        limitInputPixels: false,
        failOn: "none",
      })
        .png()
        .toBuffer();
    }
    return await sharp(buffer, { failOn: "none" }).png().toBuffer();
  } catch (err) {
    console.warn("MRZ image OCR: could not rasterize document:", err);
    return null;
  }
}

/**
 * OCR the bottom ~22% of the passport biodata page (MRZ zone) with Tesseract.
 * Avoids Claude transcription, which often paraphrases or drops MRZ lines.
 */
export async function extractMrzTextFromDocument(
  documentBuffer: Buffer,
  mimeType: string
): Promise<string> {
  try {
    const pagePng = await loadBiodataPagePng(documentBuffer, mimeType);
    if (!pagePng) return "";

    const metadata = await sharp(pagePng).metadata();
    const height = metadata.height ?? 0;
    const width = metadata.width ?? 0;
    if (width < 8 || height < 8) return "";

    const cropHeight = Math.max(1, Math.floor(height * 0.22));
    const cropTop = height - cropHeight;

    const mrzStrip = await sharp(pagePng)
      .extract({ left: 0, top: cropTop, width, height: cropHeight })
      .greyscale()
      .normalize()
      .png()
      .toBuffer();

    const worker = await createWorker("eng", 1, {
      logger: () => {},
    });
    try {
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      });
      const {
        data: { text },
      } = await worker.recognize(mrzStrip);
      return (text ?? "").replace(/\r/g, "\n");
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.warn("MRZ image OCR failed:", err);
    return "";
  }
}

/** @deprecated Use extractMrzTextFromDocument — kept for naming parity with older prompts. */
export async function extractMrzTextFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  return extractMrzTextFromDocument(imageBuffer, mimeType);
}
