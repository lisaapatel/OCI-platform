/** Stored in `documents.failure_reason` after a failed extraction step. */
export type ExtractionFailureCode =
  | "drive_download_failed"
  | "claude_api_failed"
  | "parse_failed"
  | "db_save_failed";

export const FAILURE_REASON_LABELS: Record<ExtractionFailureCode, string> = {
  drive_download_failed: "Could not download from Drive",
  claude_api_failed: "AI service request failed",
  parse_failed: "Could not parse AI response",
  db_save_failed: "Could not save fields to database",
};

export function labelForFailureReason(code: string | null | undefined): string {
  if (!code) return "Extraction failed";
  return (
    FAILURE_REASON_LABELS[code as ExtractionFailureCode] ?? `Failed (${code})`
  );
}
