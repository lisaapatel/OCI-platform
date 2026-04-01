/**
 * OCI govt portal limits (official prerequisites: supporting PDFs and JPEG photo/signature).
 * Single source of truth for validation, compression, and UI copy.
 */

/** Supporting documents: PDF max size (KB). */
export const PORTAL_PDF_MAX_KB = 1000;
export const PORTAL_PDF_MAX_BYTES = PORTAL_PDF_MAX_KB * 1024;

/** Default POST compress target — slightly under max for encoder headroom. */
export const PORTAL_PDF_COMPRESS_TARGET_KB = 950;

/** @deprecated Use PORTAL_PDF_MAX_KB — alias for existing imports */
export const PORTAL_MAX_KB = PORTAL_PDF_MAX_KB;
/** @deprecated Use PORTAL_PDF_MAX_BYTES — alias for existing imports */
export const PORTAL_MAX_BYTES = PORTAL_PDF_MAX_BYTES;

/** Applicant photo & signature: JPEG max size (KB). */
export const PORTAL_IMAGE_MAX_KB = 500;
export const PORTAL_IMAGE_MAX_BYTES = PORTAL_IMAGE_MAX_KB * 1024;
