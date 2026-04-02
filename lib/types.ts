export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface Application {
  id: string;
  app_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  service_type:
    | "oci_new"
    | "oci_renewal"
    | "passport_renewal"
    | "passport_us_renewal_test";
  status:
    | "docs_pending"
    | "ready_for_review"
    | "ready_to_submit"
    | "submitted"
    | "on_hold";
  drive_folder_id: string;
  drive_folder_url: string;
  notes: string;
  created_at: string;
  created_by: string;
  vfs_tracking_number?: string | null;
  govt_tracking_number?: string | null;
  customer_price?: number | null;
  our_cost?: number | null;
  /** Omitted on legacy rows; null if unknown */
  payment_status?: PaymentStatus | null;
}

export interface Document {
  id: string;
  application_id: string;
  doc_type: string;
  file_name: string;
  drive_file_id: string;
  drive_view_url: string;
  extraction_status: "pending" | "processing" | "done" | "failed";
  /** Machine code from failed extraction step; null when not failed */
  failure_reason: string | null;
  uploaded_at: string;
  /** Govt portal–compressed copy in Drive folder "Compressed" */
  compressed_drive_file_id?: string | null;
  compressed_drive_url?: string | null;
  compressed_size_bytes?: number | null;
  /** Govt photo/signature auto-fixed file in Drive folder "Fixed" */
  fixed_drive_file_id?: string | null;
  fixed_drive_url?: string | null;
  fixed_size_bytes?: number | null;
}

/** 200 JSON body from POST /api/extract/single (non-streaming) */
export type ExtractSingleResultBody = {
  ok: true;
  status: "done" | "failed";
  reason?: string;
  human_reason?: string;
  fields_extracted: number;
  field_data: { field_name: string; field_value: string | null }[];
  skipped?: boolean;
  document_id?: string;
};

export interface ExtractedField {
  id: string;
  application_id: string;
  field_name: string;
  field_value: string;
  source_doc_type: string;
  is_flagged: boolean;
  flag_note: string;
  reviewed_by: string;
  reviewed_at: string;
  /** Present on DB rows; used for latest-wins deduplication */
  updated_at?: string;
  created_at?: string;
}
