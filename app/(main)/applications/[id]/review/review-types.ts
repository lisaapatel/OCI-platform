import type { DocumentQualityResult } from "@/lib/document-quality-gate";

export type ReviewDocumentRow = {
  id: string;
  doc_type: string;
  file_name: string;
  drive_view_url: string;
  drive_file_id: string;
  pre_extraction_quality?: DocumentQualityResult | null;
  /** Precomputed on the server when status !== ok (avoids client import of quality gate). */
  quality_hint?: string;
};
