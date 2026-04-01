-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Applications table
create table applications (
  id uuid primary key default uuid_generate_v4(),
  app_number text unique not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  service_type text not null check (service_type in ('oci_new', 'oci_renewal', 'passport_renewal')),
  status text not null default 'docs_pending' check (status in ('docs_pending', 'ready_for_review', 'ready_to_submit', 'submitted', 'on_hold')),
  drive_folder_id text,
  drive_folder_url text,
  notes text,
  created_at timestamp with time zone default now(),
  created_by uuid references auth.users(id)
);

-- Documents table
create table documents (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id) on delete cascade,
  doc_type text not null,
  file_name text,
  drive_file_id text,
  drive_view_url text,
  extraction_status text default 'pending' check (extraction_status in ('pending', 'processing', 'done', 'failed')),
  failure_reason text,
  uploaded_at timestamp with time zone default now(),
  compressed_drive_file_id text,
  compressed_drive_url text,
  compressed_size_bytes bigint,
  fixed_drive_file_id text,
  fixed_drive_url text,
  fixed_size_bytes bigint
);

-- Extracted fields table
create table extracted_fields (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id) on delete cascade,
  field_name text not null,
  field_value text,
  source_doc_type text,
  is_flagged boolean default false,
  flag_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamp with time zone,
  updated_at timestamp with time zone default now()
);

-- Auto-increment app number function
create or replace function generate_app_number()
returns text as $$
declare
  next_num int;
begin
  select count(*) + 1 into next_num from applications;
  return 'APP-' || lpad(next_num::text, 4, '0');
end;
$$ language plpgsql;

-- Row Level Security (basic — only authenticated users can access)
alter table applications enable row level security;
alter table documents enable row level security;
alter table extracted_fields enable row level security;

create policy "Authenticated users can do everything on applications"
  on applications for all using (auth.role() = 'authenticated');

create policy "Authenticated users can do everything on documents"
  on documents for all using (auth.role() = 'authenticated');

create policy "Authenticated users can do everything on extracted_fields"
  on extracted_fields for all using (auth.role() = 'authenticated');

-- Existing databases: add portal compression columns (run once if upgrading):
-- alter table documents add column if not exists compressed_drive_file_id text;
-- alter table documents add column if not exists compressed_drive_url text;
-- alter table documents add column if not exists compressed_size_bytes bigint;
-- alter table documents add column if not exists fixed_drive_file_id text;
-- alter table documents add column if not exists fixed_drive_url text;
-- alter table documents add column if not exists fixed_size_bytes bigint;
