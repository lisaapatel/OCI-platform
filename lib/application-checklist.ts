import type { Application } from "@/lib/types";
import {
  getOciChecklistLabel,
  OCI_NEW_CHECKLIST,
  type ChecklistItem,
} from "@/lib/oci-new-checklist";

export type { ChecklistItem };

/**
 * Minimal DS-82 test POC: passport for extraction + photo for validation pipeline.
 * DS-82 PDF is generated in-app, not uploaded.
 */
export const PASSPORT_US_RENEWAL_TEST_CHECKLIST: ChecklistItem[] = [
  {
    doc_type: "current_passport",
    label: "Current Passport",
    required: true,
    optionalNote:
      "DS-82 renewal: undamaged, issued within last 15 years, issued at age 16+. Primary extraction source.",
  },
  {
    doc_type: "applicant_photo",
    label: "Passport Photo (2×2)",
    required: true,
    optionalNote:
      "White background, no glasses, neutral expression. Reuses portal JPEG validation.",
  },
];

export function getChecklistForServiceType(
  serviceType: Application["service_type"]
): ChecklistItem[] {
  if (serviceType === "passport_us_renewal_test") {
    return PASSPORT_US_RENEWAL_TEST_CHECKLIST;
  }
  return OCI_NEW_CHECKLIST;
}

export function checklistRequiredCount(checklist: ChecklistItem[]): number {
  return checklist.filter((i) => i.required).length;
}

export function resolveDocTypeChecklistLabel(docType: string): string {
  const dt = docType.trim();
  const hit = PASSPORT_US_RENEWAL_TEST_CHECKLIST.find((i) => i.doc_type === dt);
  if (hit) return hit.label;
  return getOciChecklistLabel(dt);
}
