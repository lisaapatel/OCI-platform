import type { ChecklistItem } from "@/lib/oci-new-checklist";

export type PassportRenewalApplicantType = "adult" | "minor" | "both";

export type PassportRenewalSelectionMode =
  | "single_optional"
  | "one_of_optional"
  | "one_of_required_if_applicable"
  | "multi_optional";

export type PassportRenewalApplicabilityFlags = {
  hasSpouseNameChange: boolean;
  hasNameChange: boolean;
  hasParentNameChange: boolean;
  hasDobChange: boolean;
  hasIndianAddressChange: boolean;
};

export const DEFAULT_PASSPORT_RENEWAL_APPLICABILITY: PassportRenewalApplicabilityFlags =
  {
    hasSpouseNameChange: false,
    hasNameChange: false,
    hasParentNameChange: false,
    hasDobChange: false,
    hasIndianAddressChange: false,
  };

export type PassportRenewalDocumentOption = {
  doc_type: string;
  label: string;
  required: boolean;
  optionalNote?: string;
  extractionPolicy: "extract" | "skip";
  readinessImpact: "blocking" | "non_blocking";
  fulfillmentOwner?: "customer_upload" | "portal_pdf_internal";
  acceptedEvidence?: readonly string[];
};

export type PassportRenewalDocumentGroup = {
  id: string;
  label: string;
  appliesTo: PassportRenewalApplicantType;
  selectionMode: PassportRenewalSelectionMode;
  optionalNote?: string;
  options: readonly PassportRenewalDocumentOption[];
  requiresAnyFlag?: keyof PassportRenewalApplicabilityFlags;
};

export const PASSPORT_RENEWAL_DOCUMENT_GROUPS: readonly PassportRenewalDocumentGroup[] =
  [
    {
      id: "core_identity",
      label: "Core identity",
      appliesTo: "both",
      selectionMode: "single_optional",
      options: [
        {
          doc_type: "current_passport",
          label: "Current Indian Passport",
          required: true,
          optionalNote:
            "Original scan — first page, last page, validity observation page",
          extractionPolicy: "extract",
          readinessImpact: "blocking",
        },
      ],
    },
    {
      id: "core_photo",
      label: "Core photo",
      appliesTo: "both",
      selectionMode: "single_optional",
      options: [
        {
          doc_type: "applicant_photo",
          label: "Passport Photo",
          required: true,
          extractionPolicy: "skip",
          readinessImpact: "blocking",
        },
      ],
    },
    {
      id: "us_status",
      label: "US legal status proof",
      appliesTo: "both",
      selectionMode: "one_of_optional",
      optionalNote: "Upload one status proof when applicable.",
      options: [
        {
          doc_type: "us_status_proof",
          label: "US Status Proof",
          required: false,
          optionalNote: "Upload if applicable",
          extractionPolicy: "extract",
          readinessImpact: "non_blocking",
          acceptedEvidence: [
            "Green card (front/back)",
            "Valid visa",
            "EAD (front/back)",
            "I-797A approval",
            "Work or study permit",
            "Visa extension filing proof",
          ],
        },
      ],
    },
    {
      id: "us_address",
      label: "US address proof",
      appliesTo: "both",
      selectionMode: "one_of_optional",
      optionalNote: "Upload one address proof that matches the application address.",
      options: [
        {
          doc_type: "us_address_proof",
          label: "US Address Proof",
          required: false,
          optionalNote: "Upload if applicable",
          extractionPolicy: "extract",
          readinessImpact: "non_blocking",
          acceptedEvidence: [
            "State ID",
            "Driver's license",
            "Recent utility bill",
            "Signed lease or mortgage",
            "Recent tax return",
            "University housing letter",
            "Notarized hotel bill (temporary stay)",
          ],
        },
      ],
    },
    {
      id: "indian_address",
      label: "Indian address change proof",
      appliesTo: "both",
      selectionMode: "one_of_required_if_applicable",
      requiresAnyFlag: "hasIndianAddressChange",
      optionalNote:
        "Enable when adding/changing Indian address in the passport application.",
      options: [
        {
          doc_type: "indian_address_proof",
          label: "Indian Address Proof",
          required: false,
          optionalNote: "Upload when Indian address is being added/changed",
          extractionPolicy: "extract",
          readinessImpact: "non_blocking",
          acceptedEvidence: [
            "Aadhaar card",
            "Indian voter ID",
            "Indian utility bill",
            "Indian driver's license",
            "PSU bank photo passbook",
            "Parent or relative Indian address proof",
          ],
        },
      ],
    },
    {
      id: "application_packet",
      label: "Application packet",
      appliesTo: "both",
      selectionMode: "multi_optional",
      optionalNote:
        "Operational packet docs from the VFS checklist. Keep uploadable but non-blocking.",
      options: [
        {
          doc_type: "annexure_e_signed",
          label: "Annexure E (signed copy)",
          required: false,
          optionalNote: "Upload signed copy when provided externally",
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
          fulfillmentOwner: "portal_pdf_internal",
        },
        {
          doc_type: "courier_label_receipt",
          label: "Courier Label / Mailing Proof",
          required: false,
          optionalNote: "Upload prepaid label or courier receipt copy",
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
        },
      ],
    },
    {
      id: "spouse_change",
      label: "Spouse name update bundle",
      appliesTo: "adult",
      selectionMode: "multi_optional",
      requiresAnyFlag: "hasSpouseNameChange",
      options: [
        {
          doc_type: "spouse_name_change_proof",
          label: "Spouse Name Change Proof",
          required: false,
          optionalNote:
            "Marriage certificate, divorce/death + remarriage proof, or equivalent",
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
        },
        {
          doc_type: "joint_photo_declaration",
          label: "Joint Photo Declaration (notarized)",
          required: false,
          optionalNote: "Upload when used instead of marriage certificate",
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
          fulfillmentOwner: "portal_pdf_internal",
        },
      ],
    },
    {
      id: "name_change",
      label: "Name change bundle",
      appliesTo: "both",
      selectionMode: "multi_optional",
      requiresAnyFlag: "hasNameChange",
      options: [
        {
          doc_type: "name_change_affidavit",
          label: "Name Change Affidavit (notarized)",
          required: false,
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
          fulfillmentOwner: "portal_pdf_internal",
        },
        {
          doc_type: "name_change_newspaper_ads",
          label: "Name Change Newspaper Publications",
          required: false,
          optionalNote:
            "National daily in India and USA (or gazette, as applicable)",
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
        },
      ],
    },
    {
      id: "parent_name_change",
      label: "Parent name correction bundle",
      appliesTo: "both",
      selectionMode: "multi_optional",
      requiresAnyFlag: "hasParentNameChange",
      options: [
        {
          doc_type: "parent_name_change_supporting_docs",
          label: "Parent Name Change Supporting Documents",
          required: false,
          optionalNote:
            "Two public documents showing updated parent name(s)",
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
        },
        {
          doc_type: "birth_or_school_leaving_certificate",
          label: "Birth / School Leaving Certificate",
          required: false,
          optionalNote: "Use when required for parent-name correction path",
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
        },
      ],
    },
    {
      id: "dob_change",
      label: "Date of birth correction bundle",
      appliesTo: "both",
      selectionMode: "multi_optional",
      requiresAnyFlag: "hasDobChange",
      options: [
        {
          doc_type: "dob_change_proof",
          label: "Date of Birth Change Proof",
          required: false,
          optionalNote:
            "Birth certificate, school record, PAN, voter ID, driving license, etc.",
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
        },
        {
          doc_type: "dob_change_court_order",
          label: "DOB Change Court / Competent Authority Order",
          required: false,
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
        },
      ],
    },
    {
      id: "supporting",
      label: "Catch-all supporting",
      appliesTo: "both",
      selectionMode: "single_optional",
      options: [
        {
          doc_type: "supporting_docs",
          label: "Any Additional Supporting Documents",
          required: false,
          optionalNote: "Upload if applicable",
          extractionPolicy: "skip",
          readinessImpact: "non_blocking",
        },
      ],
    },
  ] as const;

function groupAppliesToApplicant(
  group: PassportRenewalDocumentGroup,
  isMinor: boolean
): boolean {
  if (group.appliesTo === "both") return true;
  if (group.appliesTo === "minor") return isMinor;
  return !isMinor;
}

function groupEnabledByFlags(
  group: PassportRenewalDocumentGroup,
  flags: PassportRenewalApplicabilityFlags
): boolean {
  if (!group.requiresAnyFlag) return true;
  return flags[group.requiresAnyFlag] === true;
}

export function getPassportRenewalChecklist(params?: {
  isMinor?: boolean;
  applicability?: Partial<PassportRenewalApplicabilityFlags>;
}): ChecklistItem[] {
  const isMinor = params?.isMinor === true;
  const flags: PassportRenewalApplicabilityFlags = {
    ...DEFAULT_PASSPORT_RENEWAL_APPLICABILITY,
    ...(params?.applicability ?? {}),
  };
  const out: ChecklistItem[] = [];

  for (const group of PASSPORT_RENEWAL_DOCUMENT_GROUPS) {
    if (!groupAppliesToApplicant(group, isMinor)) continue;
    if (!groupEnabledByFlags(group, flags)) continue;
    for (const option of group.options) {
      if (option.fulfillmentOwner === "portal_pdf_internal") continue;
      out.push({
        doc_type: option.doc_type,
        label: option.label,
        required: option.required,
        optionalNote: option.optionalNote ?? group.optionalNote,
      });
    }
  }
  return out;
}

const ALL_PASSPORT_RENEWAL_OPTIONS = PASSPORT_RENEWAL_DOCUMENT_GROUPS.flatMap(
  (group) => group.options
);

export function getPassportRenewalChecklistLabel(docType: string): string | null {
  const dt = docType.trim();
  const hit = ALL_PASSPORT_RENEWAL_OPTIONS.find((option) => option.doc_type === dt);
  return hit ? hit.label : null;
}
