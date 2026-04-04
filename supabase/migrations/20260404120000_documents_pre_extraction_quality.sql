-- Advisory JSON from pre-extraction quality scan (does not block extraction).
alter table documents
  add column if not exists pre_extraction_quality jsonb;

comment on column documents.pre_extraction_quality is 'Last document-quality-gate result before AI extraction (advisory).';
