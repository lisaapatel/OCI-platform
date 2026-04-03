-- Nullable OCI intake lane; NULL = legacy behavior (unchanged checklists).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS oci_intake_variant text;

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_oci_intake_variant_check;

ALTER TABLE applications
  ADD CONSTRAINT applications_oci_intake_variant_check
  CHECK (
    oci_intake_variant IS NULL
    OR oci_intake_variant IN (
      'new_prev_indian',
      'new_foreign_birth',
      'misc_reissue'
    )
  );
