-- Robust Upload & OCR Pipeline Database Schema
-- This schema supports the new deterministic, dual-vendor OCR pipeline
-- Run this SQL in Supabase SQL editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CASES TABLE (main case coordination)
CREATE TABLE IF NOT EXISTS public.cases (
  case_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  email_hash TEXT, -- For user correlation without storing emails
  status TEXT DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'completed', 'failed'))
);

-- ARTIFACTS TABLE (individual files with correlation metadata)
CREATE TABLE IF NOT EXISTS public.artifacts (
  artifact_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  artifact_digest TEXT NOT NULL, -- SHA256 hash for file integrity
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  pages INTEGER DEFAULT 1,
  doc_type TEXT CHECK (doc_type IN ('EOB', 'BILL', 'LETTER', 'PORTAL', 'INSURANCE_CARD', 'UNKNOWN')),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OCR EXTRACTIONS TABLE (normalized consensus results)
CREATE TABLE IF NOT EXISTS public.ocr_extractions (
  id BIGSERIAL PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  artifact_id UUID NOT NULL REFERENCES public.artifacts(artifact_id) ON DELETE CASCADE,
  artifact_digest TEXT NOT NULL,
  page INTEGER NOT NULL,
  row_idx INTEGER NOT NULL,
  doc_type TEXT,

  -- Structured billing fields
  code TEXT,
  code_system TEXT CHECK (code_system IN ('CPT', 'HCPCS', 'REV', 'POS') OR code_system IS NULL),
  modifiers TEXT[],
  description TEXT,
  units NUMERIC,
  dos DATE,
  pos TEXT,
  rev_code TEXT,
  npi TEXT,

  -- Financial fields (in cents for precision)
  charge_cents INTEGER,
  allowed_cents INTEGER,
  plan_paid_cents INTEGER,
  patient_resp_cents INTEGER,

  -- Unstructured document metadata
  keyfacts JSONB, -- denial_reason, carc_codes, rarc_codes, auth_or_referral, etc.

  -- Quality and consensus metrics
  low_conf BOOLEAN DEFAULT FALSE,
  vendor_consensus REAL, -- 0..1 overlap score between OpenAI & Anthropic
  validators JSONB, -- regex_pass, row_has_money, math_check, etc.
  bbox JSONB, -- optional relative coordinates
  conf REAL, -- vendor confidence fusion

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DETECTIONS TABLE (18-rule billing error detection results)
CREATE TABLE IF NOT EXISTS public.detections (
  id BIGSERIAL PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  artifact_id UUID REFERENCES public.artifacts(artifact_id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'high')),
  explanation TEXT NOT NULL,
  evidence JSONB, -- lineRefs, pageRefs, etc.
  citations JSONB, -- [{title, authority, citation}]
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_artifacts_case ON public.artifacts(case_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_digest ON public.artifacts(artifact_digest);
CREATE INDEX IF NOT EXISTS idx_ocr_extractions_case ON public.ocr_extractions(case_id);
CREATE INDEX IF NOT EXISTS idx_ocr_extractions_artifact ON public.ocr_extractions(artifact_id);
CREATE INDEX IF NOT EXISTS idx_ocr_extractions_digest ON public.ocr_extractions(artifact_digest);
CREATE INDEX IF NOT EXISTS idx_ocr_extractions_docpage ON public.ocr_extractions(doc_type, page);
CREATE INDEX IF NOT EXISTS idx_detections_case ON public.detections(case_id);
CREATE INDEX IF NOT EXISTS idx_detections_rule ON public.detections(rule_key);

-- PRICED SUMMARY VIEW (for fast UI rendering)
CREATE OR REPLACE VIEW public.v_priced_summary AS
SELECT
  case_id,
  artifact_id,
  page,
  JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'row_idx', row_idx,
      'code', code,
      'code_system', code_system,
      'modifiers', modifiers,
      'description', description,
      'units', units,
      'dos', TO_CHAR(dos, 'YYYY-MM-DD'),
      'pos', pos,
      'rev_code', rev_code,
      'npi', npi,
      'charge_cents', charge_cents,
      'allowed_cents', allowed_cents,
      'plan_paid_cents', plan_paid_cents,
      'patient_resp_cents', patient_resp_cents,
      'low_conf', low_conf,
      'vendor_consensus', vendor_consensus
    ) ORDER BY page, row_idx
  ) AS lines
FROM public.ocr_extractions
WHERE doc_type IN ('BILL', 'EOB')
GROUP BY case_id, artifact_id, page;

-- Row Level Security
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detections ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (allow public access for this demo app)
-- In production, you'd want more restrictive policies based on authentication

CREATE POLICY "Allow public access to cases" ON public.cases
  FOR ALL USING (TRUE);

CREATE POLICY "Allow public access to artifacts" ON public.artifacts
  FOR ALL USING (TRUE);

CREATE POLICY "Allow public access to ocr_extractions" ON public.ocr_extractions
  FOR ALL USING (TRUE);

CREATE POLICY "Allow public access to detections" ON public.detections
  FOR ALL USING (TRUE);

-- Grant necessary permissions
GRANT ALL ON public.cases TO anon, authenticated;
GRANT ALL ON public.artifacts TO anon, authenticated;
GRANT ALL ON public.ocr_extractions TO anon, authenticated;
GRANT ALL ON public.detections TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.ocr_extractions_id_seq TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.detections_id_seq TO anon, authenticated;