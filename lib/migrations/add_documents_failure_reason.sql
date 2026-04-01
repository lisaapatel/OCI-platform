-- Run in Supabase SQL editor (or via migration tooling)
alter table documents add column if not exists failure_reason text;
