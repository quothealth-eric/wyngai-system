-- WyngAI Search Platform Database Schema
-- Enhanced schema for legislation tracking, Q&A corpus, and user management

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- LEGISLATION TRACKING TABLES
-- ============================================================================

-- Congress.gov bills metadata
CREATE TABLE IF NOT EXISTS public.leg_bills (
    bill_id text PRIMARY KEY,              -- e.g., "118-HR-5378"
    congress int NOT NULL,                 -- 118
    chamber text NOT NULL,                 -- House|Senate
    number text NOT NULL,                  -- "HR 5378"
    title text,
    introduced_date date,
    latest_action text,
    latest_action_date date,
    committees text[],                     -- optional
    subjects text[],                       -- optional
    url text,
    summary text,                          -- AI-generated lay summary
    implications jsonb,                    -- structured implications data
    non_partisan_summary text,             -- neutral summary for display
    retrieved_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    status text DEFAULT 'active'
);

-- Bill sections (chunked bill text & committee reports)
CREATE TABLE IF NOT EXISTS public.leg_sections (
    section_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id text REFERENCES public.leg_bills(bill_id) ON DELETE CASCADE,
    path text,                             -- e.g., "Title I Sec. 101"
    text text NOT NULL,
    tokens int,
    section_type text DEFAULT 'bill_text', -- bill_text|committee_report|summary
    created_at timestamptz DEFAULT now()
);

-- Embeddings for bill sections
CREATE TABLE IF NOT EXISTS public.leg_embeddings (
    section_id uuid PRIMARY KEY REFERENCES public.leg_sections(section_id) ON DELETE CASCADE,
    embedding vector(1536)                 -- OpenAI text-embedding-3-large
);

-- ============================================================================
-- ENHANCED Q&A AND KNOWLEDGE BASE
-- ============================================================================

-- Documents table (enhanced for multiple source types)
CREATE TABLE IF NOT EXISTS public.documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    source_type text NOT NULL,             -- healthcare_gov|cms|doi|payer|legislation|corpus
    authority text,                        -- CMS|HealthCare.gov|California DOI|etc
    url text,
    content_hash text UNIQUE,
    raw_content text,
    processed_content text,
    metadata jsonb,                        -- flexible metadata storage
    authority_rank decimal(3,2) DEFAULT 0.5,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Document sections (chunks for RAG)
CREATE TABLE IF NOT EXISTS public.sections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
    path text[],                           -- hierarchical path in document
    text text NOT NULL,
    tokens int,
    section_type text DEFAULT 'content',   -- content|header|table|list
    metadata jsonb,
    created_at timestamptz DEFAULT now()
);

-- Embeddings for document sections
CREATE TABLE IF NOT EXISTS public.embeddings (
    section_id uuid PRIMARY KEY REFERENCES public.sections(id) ON DELETE CASCADE,
    embedding vector(1536)
);

-- Q&A corpus from the provided JSON file
CREATE TABLE IF NOT EXISTS public.qa_corpus (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question text NOT NULL,
    answer text NOT NULL,
    intent text,                           -- classified intent
    themes text[],                         -- topics/themes array
    sources jsonb,                         -- source references from JSON
    authority_rank decimal(3,2) DEFAULT 0.8,
    category text,                         -- marketplace|medicare|medicaid|appeals|etc
    state_specific text,                   -- state code if state-specific
    created_at timestamptz DEFAULT now()
);

-- Embeddings for Q&A corpus
CREATE TABLE IF NOT EXISTS public.qa_embeddings (
    qa_id uuid PRIMARY KEY REFERENCES public.qa_corpus(id) ON DELETE CASCADE,
    question_embedding vector(1536),
    answer_embedding vector(1536)
);

-- ============================================================================
-- USER MANAGEMENT AND SESSIONS
-- ============================================================================

-- Users table for authentication
CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    email_verified boolean DEFAULT false,
    verification_token text,
    reset_token text,
    reset_token_expires timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    last_login_at timestamptz
);

-- User sessions for 14-day retention
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    session_token text UNIQUE NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now(),
    last_active_at timestamptz DEFAULT now()
);

-- Chat sessions (enhanced for user association)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id text UNIQUE NOT NULL,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL, -- Allow anonymous sessions
    title text,                            -- user-defined or auto-generated title
    context_frame jsonb,                   -- slot management data
    session_type text DEFAULT 'search',   -- search|analysis|appeal|etc
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT (now() + interval '14 days')
);

-- Conversation history
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    role text NOT NULL,                    -- user|assistant|system
    content text NOT NULL,
    metadata jsonb,                        -- intent, confidence, citations, etc
    created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- ANALYTICS AND TRACKING
-- ============================================================================

-- Enhanced analytics events
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    chat_id text,
    session_id text,
    event_name text NOT NULL,
    event_params jsonb,
    created_at timestamptz DEFAULT now()
);

-- Search analytics
CREATE TABLE IF NOT EXISTS public.search_analytics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    query text NOT NULL,
    query_mode text,                       -- insurance|legislation|mixed
    intent text,
    results_count int,
    clicked_result_rank int,
    confidence_score decimal(3,2),
    sources_used text[],                   -- authority types used
    created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- RESOURCE LINKS AND AUTHORITIES
-- ============================================================================

-- Resource links (enhanced)
CREATE TABLE IF NOT EXISTS public.resource_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    url text NOT NULL,
    authority text NOT NULL,               -- source authority
    category text,                         -- marketplace|doi|cms|payer|etc
    state_specific text,                   -- state code if applicable
    description text,
    metadata jsonb,
    created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Legislation indexes
CREATE INDEX IF NOT EXISTS idx_leg_bills_congress_chamber ON public.leg_bills(congress, chamber);
CREATE INDEX IF NOT EXISTS idx_leg_bills_subjects ON public.leg_bills USING GIN(subjects);
CREATE INDEX IF NOT EXISTS idx_leg_bills_introduced_date ON public.leg_bills(introduced_date);
CREATE INDEX IF NOT EXISTS idx_leg_sections_bill_id ON public.leg_sections(bill_id);

-- Document and section indexes
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON public.documents(source_type);
CREATE INDEX IF NOT EXISTS idx_documents_authority ON public.documents(authority);
CREATE INDEX IF NOT EXISTS idx_documents_authority_rank ON public.documents(authority_rank);
CREATE INDEX IF NOT EXISTS idx_sections_document_id ON public.sections(document_id);

-- Q&A corpus indexes
CREATE INDEX IF NOT EXISTS idx_qa_corpus_category ON public.qa_corpus(category);
CREATE INDEX IF NOT EXISTS idx_qa_corpus_state_specific ON public.qa_corpus(state_specific);
CREATE INDEX IF NOT EXISTS idx_qa_corpus_themes ON public.qa_corpus USING GIN(themes);

-- User and session indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON public.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_chat_id ON public.chat_sessions(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_expires_at ON public.chat_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(chat_session_id);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON public.analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query_mode ON public.search_analytics(query_mode);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created_at ON public.search_analytics(created_at);

-- Resource links indexes
CREATE INDEX IF NOT EXISTS idx_resource_links_category ON public.resource_links(category);
CREATE INDEX IF NOT EXISTS idx_resource_links_state_specific ON public.resource_links(state_specific);

-- ============================================================================
-- VECTOR SIMILARITY SEARCH FUNCTIONS
-- ============================================================================

-- Function for legislation search
CREATE OR REPLACE FUNCTION search_legislation(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    section_id uuid,
    bill_id text,
    bill_title text,
    section_path text,
    content text,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        s.section_id,
        s.bill_id,
        b.title as bill_title,
        s.path as section_path,
        s.text as content,
        1 - (e.embedding <=> query_embedding) as similarity
    FROM leg_embeddings e
    JOIN leg_sections s ON e.section_id = s.section_id
    JOIN leg_bills b ON s.bill_id = b.bill_id
    WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Function for insurance knowledge search
CREATE OR REPLACE FUNCTION search_insurance_knowledge(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    section_id uuid,
    document_title text,
    authority text,
    section_path text[],
    content text,
    authority_rank decimal,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        s.id as section_id,
        d.title as document_title,
        d.authority,
        s.path as section_path,
        s.text as content,
        d.authority_rank,
        1 - (e.embedding <=> query_embedding) as similarity
    FROM embeddings e
    JOIN sections s ON e.section_id = s.id
    JOIN documents d ON s.document_id = d.id
    WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
    ORDER BY
        d.authority_rank DESC,
        e.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Function for Q&A corpus search
CREATE OR REPLACE FUNCTION search_qa_corpus(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.75,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    qa_id uuid,
    question text,
    answer text,
    category text,
    themes text[],
    authority_rank decimal,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        q.id as qa_id,
        q.question,
        q.answer,
        q.category,
        q.themes,
        q.authority_rank,
        1 - (e.question_embedding <=> query_embedding) as similarity
    FROM qa_embeddings e
    JOIN qa_corpus q ON e.qa_id = q.id
    WHERE 1 - (e.question_embedding <=> query_embedding) > match_threshold
    ORDER BY
        q.authority_rank DESC,
        e.question_embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ============================================================================
-- TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Function to update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_leg_bills_updated_at
    BEFORE UPDATE ON leg_bills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < now();
    DELETE FROM chat_sessions WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY (Optional - can be enabled later)
-- ============================================================================

-- Enable RLS on user-related tables
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Sample RLS policies (commented out for now)
-- CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id);
-- CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);

-- ============================================================================
-- SAMPLE DATA AND VERIFICATION
-- ============================================================================

-- Insert some sample resource links
INSERT INTO resource_links (title, url, authority, category, description) VALUES
('HealthCare.gov', 'https://www.healthcare.gov', 'CMS', 'marketplace', 'Official federal marketplace'),
('Medicare.gov', 'https://www.medicare.gov', 'CMS', 'medicare', 'Official Medicare information'),
('Medicaid.gov', 'https://www.medicaid.gov', 'CMS', 'medicaid', 'Official Medicaid information')
ON CONFLICT DO NOTHING;

-- Verification query
-- SELECT 'Schema created successfully' as status;