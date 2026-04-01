export interface Application {
  id: string;
  app_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  service_type: "oci_new" | "oci_renewal" | "passport_renewal";
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
}

export interface Document {
  id: string;
  application_id: string;
  doc_type: string;
  file_name: string;
  drive_file_id: string;
  drive_view_url: string;
  extraction_status: "pending" | "processing" | "done" | "failed";
  uploaded_at: string;
}

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
}
