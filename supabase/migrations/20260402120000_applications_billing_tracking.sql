-- Run in Supabase SQL editor if migrations are not applied automatically.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS vfs_tracking_number text,
  ADD COLUMN IF NOT EXISTS govt_tracking_number text,
  ADD COLUMN IF NOT EXISTS customer_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS our_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
