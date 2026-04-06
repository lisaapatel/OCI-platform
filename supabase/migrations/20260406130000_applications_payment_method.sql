-- How the customer paid (optional; team-entered).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_payment_method_check;

ALTER TABLE applications
  ADD CONSTRAINT applications_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method IN ('zelle', 'cash', 'check', 'credit_card')
  );

COMMENT ON COLUMN applications.payment_method IS 'Payment rail: zelle, cash, check, credit_card';
