-- WyngAI Central Assistant RAG Schema Migration
-- Adds comprehensive document storage, chat sessions, and pgvector for embeddings

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents metadata table for authoritative sources
CREATE TABLE IF NOT EXISTS public.documents (
  doc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority text NOT NULL,               -- 'federal', 'cms', 'state_doi', 'payer', 'marketplace', 'transparency'
  jurisdiction text,                     -- state code for state DOI, payer name for payer policies
  payer text,                           -- specific payer for payer policies
  title text NOT NULL,
  doc_type text NOT NULL,               -- 'regulation', 'manual', 'policy', 'ncd', 'lcd', 'faq', 'form'
  eff_date date,                        -- effective date of the document
  version text,                         -- version or revision number
  url text NOT NULL,                    -- source URL
  url_hash text NOT NULL,               -- hash of URL for change detection
  sha256 text NOT NULL,                 -- SHA-256 hash of document content
  storage_path text,                    -- path in Supabase Storage
  retrieved_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Document sections for chunked content with embeddings
CREATE TABLE IF NOT EXISTS public.sections (
  section_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.documents(doc_id) ON DELETE CASCADE,
  section_path text,                    -- hierarchical path like "Chapter 1 > Section A"
  title text,                          -- section title if available
  text text NOT NULL,                  -- actual text content (500-1000 tokens)
  tokens int,                          -- token count for this section
  eff_date date,                       -- effective date (may differ from doc)
  version text,                        -- version (may differ from doc)
  embedding vector(1536),              -- OpenAI text-embedding-3-large (1536 dimensions)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Chat sessions for multi-turn conversations
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  chat_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.cases(case_id) ON DELETE SET NULL, -- link to existing case if applicable
  user_id text,                        -- optional user identifier
  session_type text DEFAULT 'insurance_assistant', -- 'insurance_assistant', 'bill_analysis', etc.
  context_data jsonb,                  -- stored context: plan info, collected facts, etc.
  started_at timestamptz DEFAULT now(),
  last_activity_at timestamptz DEFAULT now(),
  status text DEFAULT 'active'         -- 'active', 'completed', 'abandoned'
);

-- Chat messages for conversation history
CREATE TABLE IF NOT EXISTS public.chat_messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chat_sessions(chat_id) ON DELETE CASCADE,
  role text NOT NULL,                  -- 'user', 'assistant', 'system'
  content text NOT NULL,               -- message content
  message_type text DEFAULT 'text',    -- 'text', 'file_upload', 'clarification', 'answer'
  metadata jsonb,                      -- citations, next steps, forms, calculations, etc.
  files jsonb,                         -- array of uploaded file references
  created_at timestamptz DEFAULT now()
);

-- Change log for tracking data source updates
CREATE TABLE IF NOT EXISTS public.change_log (
  change_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority text NOT NULL,
  jurisdiction text,
  change_type text NOT NULL,           -- 'new_doc', 'updated_doc', 'deleted_doc', 'reindex'
  description text,
  doc_count int DEFAULT 0,
  section_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RAG cache for performance optimization
CREATE TABLE IF NOT EXISTS public.rag_cache (
  cache_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash text NOT NULL UNIQUE,     -- hash of normalized query
  query_text text NOT NULL,
  response_data jsonb NOT NULL,        -- cached RAG response
  authorities text[],                  -- authorities used in response
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Data source crawl status
CREATE TABLE IF NOT EXISTS public.crawl_status (
  source_id text PRIMARY KEY,          -- 'ecfr', 'cms_ncci', 'state_doi_ca', etc.
  last_crawl_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  documents_count int DEFAULT 0,
  sections_count int DEFAULT 0,
  next_scheduled_at timestamptz,
  crawl_frequency interval DEFAULT '1 day',
  status text DEFAULT 'pending',       -- 'pending', 'running', 'completed', 'error'
  metadata jsonb                       -- source-specific configuration
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_authority ON public.documents(authority);
CREATE INDEX IF NOT EXISTS idx_documents_jurisdiction ON public.documents(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_documents_payer ON public.documents(payer);
CREATE INDEX IF NOT EXISTS idx_documents_url_hash ON public.documents(url_hash);
CREATE INDEX IF NOT EXISTS idx_documents_retrieved_at ON public.documents(retrieved_at);

CREATE INDEX IF NOT EXISTS idx_sections_doc_id ON public.sections(doc_id);
CREATE INDEX IF NOT EXISTS idx_sections_embedding ON public.sections USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_case_id ON public.chat_sessions(case_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_activity ON public.chat_sessions(last_activity_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON public.chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_rag_cache_query_hash ON public.rag_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_rag_cache_expires_at ON public.rag_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_crawl_status_next_scheduled ON public.crawl_status(next_scheduled_at);

-- Helper view for document statistics
CREATE OR REPLACE VIEW public.v_document_stats AS
SELECT
  authority,
  jurisdiction,
  payer,
  COUNT(*) as doc_count,
  SUM((SELECT COUNT(*) FROM public.sections s WHERE s.doc_id = d.doc_id)) as section_count,
  MAX(retrieved_at) as last_retrieved,
  MIN(eff_date) as earliest_eff_date,
  MAX(eff_date) as latest_eff_date
FROM public.documents d
GROUP BY authority, jurisdiction, payer
ORDER BY authority, jurisdiction, payer;

-- Helper view for chat session summary
CREATE OR REPLACE VIEW public.v_chat_summary AS
SELECT
  cs.chat_id,
  cs.case_id,
  cs.session_type,
  cs.started_at,
  cs.last_activity_at,
  cs.status,
  COUNT(cm.message_id) as message_count,
  COUNT(CASE WHEN cm.role = 'user' THEN 1 END) as user_messages,
  COUNT(CASE WHEN cm.role = 'assistant' THEN 1 END) as assistant_messages
FROM public.chat_sessions cs
LEFT JOIN public.chat_messages cm ON cm.chat_id = cs.chat_id
GROUP BY cs.chat_id, cs.case_id, cs.session_type, cs.started_at, cs.last_activity_at, cs.status
ORDER BY cs.last_activity_at DESC;

-- Comments for documentation
COMMENT ON TABLE public.documents IS 'Metadata for authoritative insurance documents from federal, state, and payer sources';
COMMENT ON TABLE public.sections IS 'Chunked document sections with embeddings for RAG retrieval';
COMMENT ON TABLE public.chat_sessions IS 'Multi-turn conversation sessions with context preservation';
COMMENT ON TABLE public.chat_messages IS 'Individual messages within chat sessions with metadata';
COMMENT ON TABLE public.change_log IS 'Audit trail for data source updates and refreshes';
COMMENT ON TABLE public.rag_cache IS 'Performance cache for frequently asked questions';
COMMENT ON TABLE public.crawl_status IS 'Status tracking for automated data source crawlers';

COMMENT ON COLUMN public.sections.embedding IS 'Vector embedding (1536 dimensions) for semantic search using OpenAI text-embedding-3-large';
COMMENT ON COLUMN public.chat_sessions.context_data IS 'Preserved conversation context including plan details, user preferences, and collected facts';
COMMENT ON COLUMN public.chat_messages.metadata IS 'Structured response data including citations, next steps, forms, and calculations';

-- PostgreSQL function for vector similarity search
CREATE OR REPLACE FUNCTION match_sections(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  section_id uuid,
  doc_id uuid,
  section_path text,
  title text,
  text text,
  tokens int,
  eff_date date,
  version text,
  similarity float,
  documents jsonb
)
LANGUAGE sql STABLE
AS $$
  SELECT
    s.section_id,
    s.doc_id,
    s.section_path,
    s.title,
    s.text,
    s.tokens,
    s.eff_date,
    s.version,
    1 - (s.embedding <=> query_embedding) AS similarity,
    row_to_json(d.*) AS documents
  FROM sections s
  JOIN documents d ON s.doc_id = d.doc_id
  WHERE s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
$$;