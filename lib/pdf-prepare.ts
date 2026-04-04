import { PDFDocument } from "pdf-lib";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, readFile, unlink } from "fs/promises";

const execFileAsync = promisify(execFile);

/** Anthropic hard limit for document payloads (bytes). Stay a bit under. */
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * For passport documents: if the PDF has more than 2 pages, extract only the
 * first page (cover / photo page) and the last page (biodata / MRZ page).
 * All middle pages (visa stamps, observation pages) are irrelevant for extraction.
 */
async function extractPassportPages(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  if (total <= 2) return pdfBytes;

  const out = await PDFDocument.create();
  // First page (cover / photo page with MRZ)
  const [first] = await out.copyPages(src, [0]);
  out.addPage(first);
  // Last page (biodata page — where the photo and MRZ actually are on newer Indian passports)
  if (total - 1 !== 0) {
    const [last] = await out.copyPages(src, [total - 1]);
    out.addPage(last);
  }
  console.log(`[pdf-prepare] Trimmed ${total} pages → 2 (first + last)`);
  return out.save();
}

/**
 * Compress a PDF using Ghostscript (/screen preset).
 * Returns null if gs is not available.
 */
async function compressWithGhostscript(pdfBytes: Uint8Array): Promise<Uint8Array | null> {
  const inPath = join(tmpdir(), `oci_in_${Date.now()}.pdf`);
  const outPath = join(tmpdir(), `oci_out_${Date.now()}.pdf`);
  try {
    await writeFile(inPath, pdfBytes);
    await execFileAsync("gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dPDFSETTINGS=/screen",
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${outPath}`,
      inPath,
    ]);
    const result = await readFile(outPath);
    return new Uint8Array(result);
  } catch {
    return null;
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

/**
 * Prepares a PDF buffer for the Anthropic API:
 * 1. For passport doc types: trims to first + last page when >2 pages.
 * 2. If the result still exceeds MAX_BYTES, attempts Ghostscript compression.
 *
 * Returns { base64, bytes } — base64 is the ready-to-send string.
 */
export async function preparePdfForExtraction(
  base64: string,
  mimeType: string,
  isPassport: boolean
): Promise<string> {
  if (mimeType !== "application/pdf") return base64;

  let bytes = Buffer.from(base64, "base64");
  const originalSize = bytes.length;

  // Step 1: For passports, trim to first + last page
  if (isPassport) {
    try {
      const trimmed = await extractPassportPages(new Uint8Array(bytes));
      bytes = Buffer.from(trimmed);
      if (bytes.length !== originalSize) {
        console.log(
          `[pdf-prepare] Page trim: ${(originalSize / 1024 / 1024).toFixed(1)} MB → ${(bytes.length / 1024 / 1024).toFixed(1)} MB`
        );
      }
    } catch (e) {
      console.warn("[pdf-prepare] Page trim failed, using original:", e);
    }
  }

  // Step 2: If still over limit, try Ghostscript compression
  if (bytes.length > MAX_BYTES) {
    console.log(
      `[pdf-prepare] File is ${(bytes.length / 1024 / 1024).toFixed(1)} MB, attempting gs compression`
    );
    const compressed = await compressWithGhostscript(new Uint8Array(bytes));
    if (compressed && compressed.length < bytes.length) {
      console.log(
        `[pdf-prepare] gs compression: ${(bytes.length / 1024 / 1024).toFixed(1)} MB → ${(compressed.length / 1024 / 1024).toFixed(1)} MB`
      );
      bytes = Buffer.from(compressed);
    } else {
      console.warn("[pdf-prepare] gs compression unavailable or made file larger, proceeding as-is");
    }
  }

  return bytes.toString("base64");
}
