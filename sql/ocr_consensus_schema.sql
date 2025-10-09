-- OCR Consensus Pipeline Database Schema
-- Run this SQL in Supabase SQL editor to create the required tables

-- CASE & ARTIFACT REGISTRY (if not already present)
create table if not exists public.ocr_cases (
  case_id uuid primary key,
  created_at timestamptz default now(),
  email_hash text,
  source text default 'wynglite'
);

create table if not exists public.ocr_artifacts (
  artifact_id uuid primary key,
  case_id uuid references public.ocr_cases(case_id) on delete cascade,
  artifact_digest text not null,
  filename text,
  mime text,
  pages int,
  doc_type text,
  created_at timestamptz default now()
);

create index if not exists idx_ocr_artifacts_case on public.ocr_artifacts(case_id);
create index if not exists idx_ocr_artifacts_digest on public.ocr_artifacts(artifact_digest);

-- NEW: NORMALIZED ROWS (THIS is the separate table for consensus storage)
create table if not exists public.ocr_extractions (
  id bigserial primary key,
  case_id uuid not null references public.ocr_cases(case_id) on delete cascade,
  artifact_id uuid not null references public.ocr_artifacts(artifact_id) on delete cascade,
  artifact_digest text not null,
  page int not null,
  row_idx int not null,
  doc_type text,                                     -- EOB | BILL | LETTER | PORTAL | INSURANCE_CARD | UNKNOWN
  code text,
  code_system text check (code_system in ('CPT','HCPCS','REV','POS') or code_system is null),
  modifiers text[],
  description text,
  units numeric,
  dos date,
  pos text,
  rev_code text,
  npi text,
  charge_cents integer,
  allowed_cents integer,
  plan_paid_cents integer,
  patient_resp_cents integer,
  keyfacts jsonb,                                     -- for unstructured docs (denial, CARC/RARC, BIN/PCN/GRP, etc.)
  low_conf boolean default false,
  vendor_consensus real,                              -- 0..1 overlap score between OpenAI & Anthropic
  validators jsonb,                                   -- {regex_pass:boolean, row_has_money:boolean, math_check:boolean, ...}
  bbox jsonb,                                         -- optional relative coords
  conf real,                                          -- vendor confidence fusion
  created_at timestamptz default now()
);

create index if not exists idx_ocr_extract_case on public.ocr_extractions(case_id);
create index if not exists idx_ocr_extract_artifact on public.ocr_extractions(artifact_id);
create index if not exists idx_ocr_extract_digest on public.ocr_extractions(artifact_digest);
create index if not exists idx_ocr_extract_docpage on public.ocr_extractions(doc_type, page);

-- Helper view for UI (priced table)
create or replace view public.v_priced_summary as
select
  case_id,
  artifact_id,
  page,
  jsonb_agg(jsonb_build_object(
    'row_idx', row_idx,
    'code', code,
    'code_system', code_system,
    'modifiers', modifiers,
    'description', description,
    'units', units,
    'dos', to_char(dos,'YYYY-MM-DD'),
    'pos', pos,
    'rev_code', rev_code,
    'npi', npi,
    'charge_cents', charge_cents,
    'allowed_cents', allowed_cents,
    'plan_paid_cents', plan_paid_cents,
    'patient_resp_cents', patient_resp_cents,
    'low_conf', low_conf,
    'vendor_consensus', vendor_consensus
  ) order by page, row_idx) as lines
from public.ocr_extractions
where doc_type in ('BILL','EOB')
group by case_id, artifact_id, page;

-- RLS Policies (adjust based on your authentication setup)
alter table public.ocr_cases enable row level security;
alter table public.ocr_artifacts enable row level security;
alter table public.ocr_extractions enable row level security;

-- Basic RLS policy - modify based on your auth pattern
create policy "Users can access their own cases" on public.ocr_cases
  for all using (auth.uid()::text = email_hash OR auth.role() = 'service_role');

create policy "Users can access their own artifacts" on public.ocr_artifacts
  for all using (
    case_id in (
      select case_id from public.ocr_cases
      where auth.uid()::text = email_hash OR auth.role() = 'service_role'
    )
  );

create policy "Users can access their own extractions" on public.ocr_extractions
  for all using (
    case_id in (
      select case_id from public.ocr_cases
      where auth.uid()::text = email_hash OR auth.role() = 'service_role'
    )
  );