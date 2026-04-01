type ReviewSection = {
  id: string;
  title: string;
  fields: string[];
};

const REVIEW_SECTIONS: ReviewSection[] = [
  {
    id: "personal_info",
    title: "Personal Info",
    fields: [
      "first_name",
      "middle_name",
      "last_name",
      "date_of_birth",
      "place_of_birth",
      "country_of_birth",
      "birth_country",
      "gender",
      "sex",
      "marital_status",
      "nationality",
      "current_nationality",
      "citizenship",
    ],
  },
  {
    id: "passport_details",
    title: "Passport Details",
    fields: [
      "passport_number",
      "issue_date",
      "passport_issue_date",
      "date_of_issue",
      "expiry_date",
      "passport_expiry_date",
      "date_of_expiry",
      "place_of_issue",
      "country_of_issue",
      "issuing_country",
    ],
  },
  {
    id: "address",
    title: "Address",
    fields: [
      "address_line_1",
      "address_line1",
      "address",
      "street",
      "address_line_2",
      "address_line2",
      "city",
      "town",
      "state",
      "state_province",
      "postal_code",
      "pin_code",
      "pincode",
      "zip",
      "country",
    ],
  },
  {
    id: "family_info",
    title: "Family Info",
    fields: [
      "father_name",
      "father_full_name",
      "mother_name",
      "mother_full_name",
      "spouse_name",
    ],
  },
];

export const REVIEW_SECTION_ORDER = REVIEW_SECTIONS.map(({ id, title }) => ({
  id,
  title,
}));

const FIELD_TO_SECTION = new Map<string, string>();
for (const section of REVIEW_SECTIONS) {
  for (const field of section.fields) {
    FIELD_TO_SECTION.set(field, section.id);
  }
}

function startCase(value: string): string {
  return value
    .trim()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const DOC_TYPE_LABELS: Record<string, string> = {
  current_passport: "Current Passport",
  old_passport: "Old Passport",
  birth_certificate: "Birth Certificate",
  address_proof: "Address Proof",
  applicant_photo: "Applicant Photo",
  parent_indian_doc: "Parent Indian Document",
  marriage_certificate: "Marriage Certificate",
};

export function fieldSectionId(fieldName: string): string {
  return FIELD_TO_SECTION.get(fieldName) ?? "personal_info";
}

export function humanFieldLabel(fieldName: string): string {
  return startCase(fieldName);
}

export function sourceDocumentLabel(sourceDocType: string): string {
  return DOC_TYPE_LABELS[sourceDocType] ?? startCase(sourceDocType);
}

export function documentTabLabel(docType: string, fileName?: string): string {
  const fromType = DOC_TYPE_LABELS[docType] ?? startCase(docType);
  const safeFileName = (fileName ?? "").trim();
  return fromType || safeFileName || "Document";
}

export function parseDriveFileId(
  driveFileId?: string | null,
  driveViewUrl?: string | null
): string | null {
  const rawId = (driveFileId ?? "").trim();
  if (rawId) return rawId;

  const rawUrl = (driveViewUrl ?? "").trim();
  if (!rawUrl) return null;

  const byPath = rawUrl.match(/\/d\/([^/]+)/);
  if (byPath?.[1]) return byPath[1];

  const byQuery = rawUrl.match(/[?&]id=([^&]+)/);
  if (byQuery?.[1]) return byQuery[1];

  return null;
}

export function drivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function isImageFileName(fileName?: string | null): boolean {
  const value = (fileName ?? "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].some((ext) =>
    value.endsWith(ext)
  );
}
