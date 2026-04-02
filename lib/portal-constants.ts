/**
 * OCI govt portal limits (ociservices.gov.in — supporting documents + JPEG photo/signature).
 * Single source of truth for validation, compression, and UI copy.
 */

/** Applicant photo & signature: JPEG max size (explicit bytes per portal spec). */
export const PORTAL_IMAGE_MAX_KB = 500;
export const PORTAL_IMAGE_MAX_BYTES = 512000;

/** Supporting documents (PDF) on the OCI portal. */
export const PORTAL_DOC_MAX_KB = 1000;
export const PORTAL_DOC_MAX_BYTES = 1024000;

/** Default PDF compress target — slightly under max for encoder headroom. */
export const PORTAL_PDF_COMPRESS_TARGET_KB = 950;

/** @deprecated Use PORTAL_DOC_MAX_KB — legacy name (PDF checklist items). */
export const PORTAL_PDF_MAX_KB = PORTAL_DOC_MAX_KB;
/** @deprecated Use PORTAL_DOC_MAX_BYTES — legacy name. */
export const PORTAL_PDF_MAX_BYTES = PORTAL_DOC_MAX_BYTES;

/** @deprecated Use PORTAL_DOC_MAX_KB */
export const PORTAL_MAX_KB = PORTAL_DOC_MAX_KB;
/** @deprecated Use PORTAL_DOC_MAX_BYTES */
export const PORTAL_MAX_BYTES = PORTAL_DOC_MAX_BYTES;
