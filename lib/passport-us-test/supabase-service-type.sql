-- One-time: extend applications.service_type check so passport_us_renewal_test inserts succeed.
-- Run in Supabase SQL editor if inserts fail with check constraint violation.
-- Adjust constraint name if yours differs (see pg_constraint for applications).

alter table applications drop constraint if exists applications_service_type_check;

alter table applications add constraint applications_service_type_check
  check (service_type in (
    'oci_new',
    'oci_renewal',
    'passport_renewal',
    'passport_us_renewal_test'
  ));
