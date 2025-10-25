-- WyngAI Search Engine - RAG Storage Schema
-- Generated for local Supabase deployment

create table if not exists public.documents (
  doc_id uuid primary key default gen_random_uuid(),
  authority text,
  jurisdiction text,
  payer text,
  title text not null,
  doc_type text not null,
  eff_date date,
  version text,
  url text,
  url_hash text,
  sha256 text,
  license_note text,
  retrieved_at timestamptz default now()
);

create index if not exists documents_authority_idx on public.documents(authority);
create index if not exists documents_jurisdiction_idx on public.documents(jurisdiction);
create index if not exists documents_url_hash_idx on public.documents(url_hash);

create table if not exists public.sections (
  section_id uuid primary key default gen_random_uuid(),
  doc_id uuid references public.documents(doc_id) on delete cascade,
  path text,
  text text,
  tokens int,
  eff_date date,
  version text,
  created_at timestamptz default now()
);

create index if not exists sections_doc_idx on public.sections(doc_id);
create index if not exists sections_text_gin on public.sections using gin(to_tsvector('english', coalesce(text, '')));

create table if not exists public.embeddings (
  section_id uuid primary key references public.sections(section_id) on delete cascade,
  embedding vector(1536)
);

create table if not exists public.resource_links (
  key text primary key,
  label text not null,
  url text not null,
  meta jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.qa_bank (
  qa_id uuid primary key default gen_random_uuid(),
  theme text,
  question text not null,
  answer text,
  citations jsonb,
  source text,
  url text,
  created_at timestamptz default now()
);

create index if not exists qa_bank_theme_idx on public.qa_bank(theme);
create index if not exists qa_bank_source_idx on public.qa_bank(source);
create index if not exists qa_bank_question_gin on public.qa_bank using gin(to_tsvector('english', coalesce(question, '')));

create table if not exists public.changes_log (
  id bigserial primary key,
  doc_id uuid references public.documents(doc_id),
  change_note text,
  changed_at timestamptz default now()
);

comment on table public.documents is 'Authoritative document metadata for WyngAI Search RAG pipeline';
comment on table public.sections is 'Normalized text sections for embeddings and retrieval';
comment on table public.embeddings is 'Section-level vector embeddings (OpenAI text-embedding-3)';
comment on table public.resource_links is 'Resolver for marketplace, DOI, and payer directory quick links';
comment on table public.qa_bank is 'Curated + public Q&A corpus for WyngAI Search';
comment on table public.changes_log is 'Ingestion change log for auditing and diffing sources';
