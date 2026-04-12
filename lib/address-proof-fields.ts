export const ADDRESS_PROOF_FIELDS = [
  "address_line_1",
  "address_line_2",
  "city",
  "state_province",
  "postal_code",
  "country",
  "phone",
  "email",
  "permanent_address_line_1",
  "permanent_address_line_2",
  "permanent_city",
  "permanent_state",
  "permanent_state_province",
  "permanent_country",
  "permanent_postal_code",
  // US state ID / driver's license used as address proof.
  "id_document_number",
  "id_issue_date",
  "id_expiry_date",
  "id_document_holder_name",
] as const;

/** Allowed `field_name` values for address-proof doc types on the review page. */
export const ADDRESS_PROOF_FIELD_NAME_SET: ReadonlySet<string> = new Set(
  ADDRESS_PROOF_FIELDS
);

/** Doc types that use address-proof extraction and review filtering. */
export const ADDRESS_PROOF_SOURCE_DOC_TYPES: ReadonlySet<string> = new Set([
  "address_proof",
  "parent_address_proof",
  "us_address_proof",
  "indian_address_proof",
]);
