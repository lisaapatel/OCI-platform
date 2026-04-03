import { getDriveFileMetadata } from "@/lib/google-drive";

/** Infer MIME type from filename extension for storage refs or Drive fallbacks. */
export function guessMimeFromFileName(fileName: string): string | null {
  const lower = fileName.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = lower.slice(dot + 1);
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    jpe: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heic",
  };
  return map[ext] ?? null;
}

/**
 * MIME type for Claude extraction: PDFs use the document block; images use the image block.
 * Drive uploads usually expose the correct mimeType via metadata; Supabase refs fall back to the filename.
 */
export async function resolveMimeTypeForExtraction(
  driveFileRef: string,
  fileName: string
): Promise<string> {
  const fromName = guessMimeFromFileName(fileName);
  if (driveFileRef.startsWith("sb:")) {
    return fromName ?? "application/pdf";
  }
  try {
    const meta = await getDriveFileMetadata(driveFileRef);
    const m = (meta.mimeType ?? "").toLowerCase().trim();
    if (m === "application/pdf") return "application/pdf";
    if (m.startsWith("image/")) return meta.mimeType.trim();
    if (m === "application/octet-stream" || !m) {
      return fromName ?? "application/pdf";
    }
    return fromName ?? "application/pdf";
  } catch {
    return fromName ?? "application/pdf";
  }
}
