import type { Document } from "@/lib/types";

/** DB rows missing or invalid status are treated as pending so extraction can run. */
export function coerceExtractionStatus(raw: unknown): Document["extraction_status"] {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "pending" || s === "processing" || s === "done" || s === "failed") {
    return s;
  }
  return "pending";
}
