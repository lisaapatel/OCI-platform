import type { Application } from "@/lib/types";
import { composeOciChecklist } from "@/lib/oci-checklist-compose";
import {
  getOciChecklistLabel,
  OCI_NEW_CHECKLIST,
  type ChecklistItem,
} from "@/lib/oci-new-checklist";
import { isOciServiceType } from "@/lib/oci-intake-variant";
import { PARENT_DOCUMENT_CHECKLIST_ITEMS } from "@/lib/parent-documents";
import { PASSPORT_RENEWAL_CHECKLIST } from "@/lib/passport-renewal-checklist";

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
  if (serviceType === "passport_renewal") {
    return PASSPORT_RENEWAL_CHECKLIST;
  }
  if (serviceType === "passport_us_renewal_test") {
    return PASSPORT_US_RENEWAL_TEST_CHECKLIST;
  }
  return OCI_NEW_CHECKLIST;
}

/** OCI: composed checklist from variant + minor. Passport: service checklist + optional parent rows when minor. */
export function getChecklistForApplication(
  app: Pick<Application, "service_type" | "is_minor" | "oci_intake_variant">
): ChecklistItem[] {
  const st = app.service_type;
  if (st === "passport_renewal" || st === "passport_us_renewal_test") {
    const base = getChecklistForServiceType(st);
    return app.is_minor === true
      ? [...base, ...PARENT_DOCUMENT_CHECKLIST_ITEMS]
      : base;
  }
  if (isOciServiceType(st)) {
    return composeOciChecklist({
      oci_intake_variant: app.oci_intake_variant ?? null,
      is_minor: app.is_minor === true,
    });
  }
  return OCI_NEW_CHECKLIST;
}

export function checklistRequiredCount(checklist: ChecklistItem[]): number {
  return checklist.filter((i) => i.required).length;
}

export function resolveDocTypeChecklistLabel(docType: string): string {
  const dt = docType.trim();
  const pr = PASSPORT_RENEWAL_CHECKLIST.find((i) => i.doc_type === dt);
  if (pr) return pr.label;
  const hit = PASSPORT_US_RENEWAL_TEST_CHECKLIST.find((i) => i.doc_type === dt);
  if (hit) return hit.label;
  const parent = PARENT_DOCUMENT_CHECKLIST_ITEMS.find((i) => i.doc_type === dt);
  if (parent) return parent.label;
  return getOciChecklistLabel(dt);
}
