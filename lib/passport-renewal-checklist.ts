import type { ChecklistItem } from "@/lib/oci-new-checklist";

/** Indian passport renewal (VFS Global USA) — checklist only; OCI checklist unchanged. */
export const PASSPORT_RENEWAL_CHECKLIST: ChecklistItem[] = [
  {
    doc_type: "current_passport",
    label: "Current Indian Passport",
    required: true,
    optionalNote:
      "Original scan — first page, last page, validity observation page",
  },
  {
    doc_type: "applicant_photo",
    label: "Passport Photo",
    required: true,
  },
  {
    doc_type: "us_status_proof",
    label: "US Status Proof (Visa / I-797 / I-20 / EAD / Green Card)",
    required: false,
    optionalNote: "Upload if applicable",
  },
  {
    doc_type: "us_address_proof",
    label: "US Address Proof (Driver's License / Lease / Utility Bill)",
    required: false,
    optionalNote: "Upload if applicable",
  },
  {
    doc_type: "indian_address_proof",
    label: "Indian Address Proof (if updating India address)",
    required: false,
    optionalNote: "Upload if applicable",
  },
  {
    doc_type: "supporting_docs",
    label: "Any Additional Supporting Documents",
    required: false,
    optionalNote: "Upload if applicable",
  },
];
