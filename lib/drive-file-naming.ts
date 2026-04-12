/**
 * Google Drive display names: readable doc-type prefix + customer filename for originals;
 * short `{prefix}_compressed` / `{prefix}_fixed` for derived files in subfolders.
 */

/** Maps checklist `doc_type` → short Drive prefix (e.g. current_passport → passport_current). */
export const DOC_TYPE_DRIVE_PREFIX: Record<string, string> = {
  current_passport: "passport_current",
  former_indian_passport: "passport_india_former",
  old_passport: "passport_old",
  birth_certificate: "certificate_birth",
  address_proof: "proof_address",
  applicant_photo: "photo_applicant",
  applicant_signature: "signature_applicant",
  parent_passport: "parent_passport_in",
  parent_oci: "parent_oci",
  parent_indian_doc: "parent_indian",
  parent_passport_father: "parent_passport_father",
  parent_passport_mother: "parent_passport_mother",
  parent_oci_father: "parent_oci_father",
  parent_oci_mother: "parent_oci_mother",
  parent_address_proof: "parent_proof_address",
  marriage_certificate: "certificate_marriage",
  marriage_affidavit: "affidavit_marriage",
  employment_letter: "letter_employment",
  us_status_proof: "proof_us_status",
  parental_authorization: "form_parental_auth",
  indian_citizenship_relinquishment: "citizenship_relinquishment_india",
  applicant_oci_card: "oci_applicant_card",
};


const DRIVE_NAME_MAX = 220;

function basenameOnly(pathOrName: string): string {
  const s = pathOrName.trim().replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

/** One path segment or stem: safe for Drive file names. */
export function sanitizeDriveSegment(segment: string): string {
  const t = segment.trim() || "document";
  return t
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 180) || "document";
}

/** Full filename (may include extension): sanitize and cap length. */
export function sanitizeDriveFilename(fullName: string, maxLength = DRIVE_NAME_MAX): string {
  const base = basenameOnly(fullName) || "document";
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot) : "";
  const stem = dot > 0 ? base.slice(0, dot) : base;
  let stemOut = sanitizeDriveSegment(stem);
  let extOut = "";
  if (ext) {
    const e = sanitizeDriveSegment(ext.replace(/^\./, ""));
    extOut = e ? `.${e}` : "";
  }
  let out = `${stemOut}${extOut}`;
  if (out.length > maxLength) {
    const keepExt = extOut || "";
    const maxStem = Math.max(1, maxLength - keepExt.length);
    stemOut = stemOut.slice(0, maxStem);
    out = `${stemOut}${keepExt}`;
  }
  return out || "document";
}

export function drivePrefixForDocType(doc_type: string): string {
  const key = doc_type.trim();
  if (DOC_TYPE_DRIVE_PREFIX[key]) return DOC_TYPE_DRIVE_PREFIX[key];
  return sanitizeDriveSegment(key);
}

/**
 * Original upload in application folder: `{prefix}_{customerBase}{ext}`.
 * Idempotent if the client name already starts with `{prefix}_`.
 */
export function originalUploadDriveName(
  doc_type: string,
  clientFileName: string
): string {
  const prefix = drivePrefixForDocType(doc_type);
  const baseName = basenameOnly(clientFileName.trim() || "document");
  const lower = baseName.toLowerCase();
  const p = `${prefix.toLowerCase()}_`;
  if (lower.startsWith(p)) {
    return sanitizeDriveFilename(baseName);
  }
  const dot = baseName.lastIndexOf(".");
  const ext = dot > 0 ? baseName.slice(dot) : "";
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const sanitizedStem = sanitizeDriveSegment(stem);
  return sanitizeDriveFilename(`${prefix}_${sanitizedStem}${ext}`);
}

/** Portal-compressed copy in Compressed/ — one file per doc_type per app (short name). */
export function portalCompressedDriveName(
  doc_type: string,
  _file_name: string,
  outputMime: string
): string {
  void _file_name;
  const prefix = drivePrefixForDocType(doc_type);
  const ext = outputMime.toLowerCase().includes("pdf") ? ".pdf" : ".jpg";
  return `${prefix}_compressed${ext}`;
}

/** Govt-fixed JPEG in Fixed/ */
export function govtFixedDriveName(doc_type: string): string {
  return `${drivePrefixForDocType(doc_type)}_fixed.jpg`;
}

/** Standalone photo tool: JPEG in `Photos/{category}/` or local download name. */
export function standalonePhotoDriveName(
  imageType: "photo" | "signature",
  clientLabel?: string | null
): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const raw = clientLabel?.trim();
  if (raw) {
    const seg = sanitizeDriveSegment(raw).slice(0, 80);
    return `${imageType}_${seg}_${ts}.jpg`;
  }
  return `${imageType}_${ts}.jpg`;
}
