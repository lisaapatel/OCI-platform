-- Government fees breakdown + optional explicit service fee (OCI + passport renewal billing UI).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS billing_government_fees numeric(10,2),
  ADD COLUMN IF NOT EXISTS billing_government_fees_paid_by text,
  ADD COLUMN IF NOT EXISTS billing_service_fee numeric(10,2);

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_billing_gov_fees_paid_by_check;

ALTER TABLE applications
  ADD CONSTRAINT applications_billing_gov_fees_paid_by_check
  CHECK (
    billing_government_fees_paid_by IS NULL
    OR billing_government_fees_paid_by IN (
      'customer_direct',
      'company_card',
      'company_advanced',
      'not_applicable'
    )
  );

COMMENT ON COLUMN applications.billing_government_fees IS 'Combined government/VFS-style fees (v1 single bucket).';
COMMENT ON COLUMN applications.billing_government_fees_paid_by IS 'Who paid government fees: customer_direct, company_card, company_advanced, not_applicable.';
COMMENT ON COLUMN applications.billing_service_fee IS 'Optional explicit service fee; else derived from customer_price - billing_government_fees.';
