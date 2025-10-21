-- WyngAI Conversational Search Enhancement Schema
-- Adds additional tables for enhanced intent classification, data ingestion, and exports

-- Intent classification results table for confidence tracking
CREATE TABLE IF NOT EXISTS public.intent_classifications (
  classification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid REFERENCES public.chat_sessions(chat_id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.chat_messages(message_id) ON DELETE CASCADE,
  intent text NOT NULL,                    -- 'CHAT', 'ANALYZER', 'CLARIFY'
  confidence float NOT NULL,               -- 0.0 to 1.0
  themes jsonb,                           -- array of {theme, score} objects
  state text,                             -- inferred state if available
  marketplace text,                       -- 'Healthcare.gov' or 'State-based'
  payer text,                            -- detected payer if available
  reasons text[],                        -- features that led to classification
  processing_time_ms int,
  created_at timestamptz DEFAULT now()
);

-- Data source configurations for crawlers
CREATE TABLE IF NOT EXISTS public.data_sources (
  source_id text PRIMARY KEY,            -- 'ecfr', 'cms_ncci', 'healthcare_gov', etc.
  authority text NOT NULL,               -- maps to documents.authority
  jurisdiction text,                     -- optional jurisdiction
  source_type text NOT NULL,             -- 'api', 'scraper', 'rss', 'manual'
  base_url text NOT NULL,
  config jsonb,                          -- source-specific configuration
  rate_limit_per_hour int DEFAULT 100,
  robots_txt_url text,
  robots_txt_content text,
  etag text,                            -- last ETag received
  last_modified timestamptz,            -- last Last-Modified received
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Export requests tracking
CREATE TABLE IF NOT EXISTS public.export_requests (
  export_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid REFERENCES public.chat_sessions(chat_id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.chat_messages(message_id) ON DELETE CASCADE,
  export_type text NOT NULL,            -- 'pdf', 'email', 'sms', 'link'
  email_address text,                   -- for email exports
  phone_number text,                    -- for SMS exports
  status text DEFAULT 'pending',       -- 'pending', 'processing', 'completed', 'failed'
  file_path text,                      -- storage path for generated files
  signed_url text,                     -- temporary access URL
  expires_at timestamptz,              -- when signed URL expires
  error_message text,                  -- if failed
  metadata jsonb,                      -- export-specific data
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Magic links for thread sharing
CREATE TABLE IF NOT EXISTS public.magic_links (
  link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chat_sessions(chat_id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,          -- secure random token
  email_address text,                  -- optional email for link delivery
  access_count int DEFAULT 0,          -- how many times accessed
  max_access_count int DEFAULT 5,      -- maximum allowed accesses
  expires_at timestamptz NOT NULL,     -- expiration time
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz
);

-- Analytics events for GA4 integration
CREATE TABLE IF NOT EXISTS public.analytics_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid REFERENCES public.chat_sessions(chat_id) ON DELETE SET NULL,
  event_name text NOT NULL,            -- GA4 event name
  event_params jsonb,                  -- event parameters as JSON
  user_id text,                        -- optional user identifier
  session_id text,                     -- GA4 session ID if available
  client_id text,                      -- GA4 client ID if available
  user_agent text,                     -- browser user agent
  ip_address inet,                     -- client IP (for geo)
  created_at timestamptz DEFAULT now()
);

-- Document processing queue for async operations
CREATE TABLE IF NOT EXISTS public.processing_queue (
  task_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,             -- 'document_split', 'embedding_generation', 'ocr_processing'
  source_id text REFERENCES public.data_sources(source_id) ON DELETE CASCADE,
  doc_id uuid REFERENCES public.documents(doc_id) ON DELETE CASCADE,
  priority int DEFAULT 5,              -- 1 (highest) to 10 (lowest)
  status text DEFAULT 'pending',       -- 'pending', 'processing', 'completed', 'failed', 'retrying'
  retry_count int DEFAULT 0,
  max_retries int DEFAULT 3,
  input_data jsonb,                    -- task-specific input parameters
  result_data jsonb,                   -- task results
  error_message text,                  -- if failed
  assigned_worker text,                -- worker process ID
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_intent_classifications_chat_id ON public.intent_classifications(chat_id);
CREATE INDEX IF NOT EXISTS idx_intent_classifications_intent ON public.intent_classifications(intent);
CREATE INDEX IF NOT EXISTS idx_intent_classifications_confidence ON public.intent_classifications(confidence);
CREATE INDEX IF NOT EXISTS idx_intent_classifications_created_at ON public.intent_classifications(created_at);

CREATE INDEX IF NOT EXISTS idx_data_sources_authority ON public.data_sources(authority);
CREATE INDEX IF NOT EXISTS idx_data_sources_is_active ON public.data_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_data_sources_updated_at ON public.data_sources(updated_at);

CREATE INDEX IF NOT EXISTS idx_export_requests_chat_id ON public.export_requests(chat_id);
CREATE INDEX IF NOT EXISTS idx_export_requests_status ON public.export_requests(status);
CREATE INDEX IF NOT EXISTS idx_export_requests_export_type ON public.export_requests(export_type);
CREATE INDEX IF NOT EXISTS idx_export_requests_expires_at ON public.export_requests(expires_at);

CREATE INDEX IF NOT EXISTS idx_magic_links_token ON public.magic_links(token);
CREATE INDEX IF NOT EXISTS idx_magic_links_chat_id ON public.magic_links(chat_id);
CREATE INDEX IF NOT EXISTS idx_magic_links_expires_at ON public.magic_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_magic_links_is_active ON public.magic_links(is_active);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON public.analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_chat_id ON public.analytics_events(chat_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON public.analytics_events(user_id);

CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON public.processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_processing_queue_priority ON public.processing_queue(priority);
CREATE INDEX IF NOT EXISTS idx_processing_queue_task_type ON public.processing_queue(task_type);
CREATE INDEX IF NOT EXISTS idx_processing_queue_created_at ON public.processing_queue(created_at);

-- Helper views for monitoring and analytics

-- Intent accuracy tracking view
CREATE OR REPLACE VIEW public.v_intent_accuracy AS
SELECT
  intent,
  COUNT(*) as total_classifications,
  AVG(confidence) as avg_confidence,
  COUNT(CASE WHEN confidence >= 0.8 THEN 1 END) as high_confidence_count,
  COUNT(CASE WHEN confidence < 0.5 THEN 1 END) as low_confidence_count,
  ROUND(
    COUNT(CASE WHEN confidence >= 0.8 THEN 1 END)::numeric / COUNT(*)::numeric * 100, 2
  ) as high_confidence_percentage
FROM public.intent_classifications
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY intent
ORDER BY total_classifications DESC;

-- Export success rate view
CREATE OR REPLACE VIEW public.v_export_stats AS
SELECT
  export_type,
  COUNT(*) as total_requests,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_requests,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_requests,
  ROUND(
    COUNT(CASE WHEN status = 'completed' THEN 1 END)::numeric / COUNT(*)::numeric * 100, 2
  ) as success_percentage,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_processing_time_seconds
FROM public.export_requests
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY export_type
ORDER BY total_requests DESC;

-- Data source health view
CREATE OR REPLACE VIEW public.v_data_source_health AS
SELECT
  ds.source_id,
  ds.authority,
  ds.jurisdiction,
  ds.source_type,
  ds.is_active,
  cs.last_crawl_at,
  cs.last_success_at,
  cs.documents_count,
  cs.sections_count,
  cs.status as crawl_status,
  cs.last_error,
  CASE
    WHEN cs.last_success_at IS NULL THEN 'never_crawled'
    WHEN cs.last_success_at < NOW() - INTERVAL '7 days' THEN 'stale'
    WHEN cs.status = 'error' THEN 'error'
    ELSE 'healthy'
  END as health_status
FROM public.data_sources ds
LEFT JOIN public.crawl_status cs ON ds.source_id = cs.source_id
ORDER BY
  CASE
    WHEN cs.last_success_at IS NULL THEN 1
    WHEN cs.status = 'error' THEN 2
    WHEN cs.last_success_at < NOW() - INTERVAL '7 days' THEN 3
    ELSE 4
  END,
  ds.authority,
  ds.jurisdiction;

-- Processing queue summary view
CREATE OR REPLACE VIEW public.v_processing_queue_summary AS
SELECT
  task_type,
  status,
  COUNT(*) as task_count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_processing_time_seconds,
  MIN(created_at) as oldest_task,
  MAX(created_at) as newest_task
FROM public.processing_queue
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY task_type, status
ORDER BY task_type, status;

-- Functions for common operations

-- Function to clean up expired exports and magic links
CREATE OR REPLACE FUNCTION cleanup_expired_resources()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete expired export requests
  DELETE FROM public.export_requests
  WHERE expires_at < NOW() AND status = 'completed';

  -- Deactivate expired magic links
  UPDATE public.magic_links
  SET is_active = false
  WHERE expires_at < NOW() AND is_active = true;

  -- Clean up old analytics events (keep 90 days)
  DELETE FROM public.analytics_events
  WHERE created_at < NOW() - INTERVAL '90 days';

  -- Clean up old intent classifications (keep 30 days)
  DELETE FROM public.intent_classifications
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Function to generate secure magic link token
CREATE OR REPLACE FUNCTION generate_magic_link_token()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  token text;
BEGIN
  -- Generate a secure random token
  token := encode(gen_random_bytes(32), 'base64');
  -- Make it URL-safe
  token := replace(replace(token, '+', '-'), '/', '_');
  token := rtrim(token, '=');
  RETURN token;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE public.intent_classifications IS 'Tracks intent classification results with confidence scores for analytics';
COMMENT ON TABLE public.data_sources IS 'Configuration for automated data source crawlers and scrapers';
COMMENT ON TABLE public.export_requests IS 'Tracks export requests for PDFs, emails, SMS, and links';
COMMENT ON TABLE public.magic_links IS 'Secure shareable links for chat threads with expiration';
COMMENT ON TABLE public.analytics_events IS 'GA4 analytics events for user behavior tracking';
COMMENT ON TABLE public.processing_queue IS 'Async task queue for document processing and embedding generation';

COMMENT ON FUNCTION cleanup_expired_resources() IS 'Periodic cleanup function for expired exports, magic links, and old analytics data';
COMMENT ON FUNCTION generate_magic_link_token() IS 'Generates secure URL-safe tokens for magic links';

-- Insert initial data sources configuration
INSERT INTO public.data_sources (source_id, authority, source_type, base_url, config, rate_limit_per_hour) VALUES
  ('ecfr', 'federal', 'api', 'https://www.ecfr.gov/api', '{"renderer": "json", "sections": ["26", "29", "42", "45"]}', 100),
  ('federal_register', 'federal', 'api', 'https://www.federalregister.gov/api', '{"conditions": {"cfr": ["26", "29", "42", "45"]}}', 200),
  ('cms_ncci', 'cms', 'scraper', 'https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci', '{"download_pdfs": true, "parse_csv": true}', 50),
  ('cms_manuals', 'cms', 'scraper', 'https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals', '{"target_manuals": ["Claims Processing", "Coverage"]}', 50),
  ('healthcare_gov', 'marketplace', 'scraper', 'https://www.healthcare.gov', '{"focus_areas": ["enrollment", "sep", "aptc", "csr"]}', 100),
  ('ca_doi', 'state_doi', 'scraper', 'https://www.insurance.ca.gov', '{"state": "CA", "sections": ["consumer", "complaints", "appeals"]}', 30),
  ('ny_doi', 'state_doi', 'scraper', 'https://www.dfs.ny.gov/consumers/health_insurance', '{"state": "NY", "sections": ["consumer", "complaints", "appeals"]}', 30),
  ('uhc_policies', 'payer', 'scraper', 'https://www.uhc.com', '{"payer": "UnitedHealthcare", "sections": ["coverage", "prior_auth", "appeals"]}', 20),
  ('aetna_policies', 'payer', 'scraper', 'https://www.aetna.com', '{"payer": "Aetna", "sections": ["coverage", "prior_auth", "appeals"]}', 20)
ON CONFLICT (source_id) DO NOTHING;