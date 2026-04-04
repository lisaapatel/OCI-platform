-- OCI portal file reference (e.g. OCIUSA2024XXXXXXXX) for undertaking PDF and ops.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS oci_file_reference_number text;
