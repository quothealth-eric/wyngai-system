-- Enhanced Line Items Table Schema for OCR Extracted Data
-- This creates a robust table for storing all extracted billing line items
-- Run this SQL in Supabase SQL editor

-- First, check if line_items table exists and drop if needed for clean setup
DROP TABLE IF EXISTS public.line_items CASCADE;

-- Enhanced LINE_ITEMS TABLE for extracted billing information
CREATE TABLE public.line_items (
  -- Primary key and identifiers
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL, -- Links to cases.session_id for session isolation
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  -- Line item identification
  line_number INTEGER DEFAULT 1, -- Sequential line number in the document

  -- Billing codes and identifiers
  cpt_code TEXT, -- CPT/HCPCS procedure code (e.g., "99213", "J1200")
  code_description TEXT, -- Description of the procedure/service
  modifier_codes TEXT[], -- Modifier codes if any (e.g., ["-25", "-59"])

  -- Service details
  service_date DATE, -- Date of service
  place_of_service TEXT, -- Place of service code
  provider_npi TEXT, -- National Provider Identifier

  -- Financial information (using NUMERIC for precision)
  units INTEGER DEFAULT 1, -- Number of units
  charge_amount NUMERIC(12,2), -- Charged amount
  allowed_amount NUMERIC(12,2), -- Allowed amount by insurance
  paid_amount NUMERIC(12,2), -- Amount paid by insurance
  patient_responsibility NUMERIC(12,2), -- Patient responsibility amount
  deductible_amount NUMERIC(12,2), -- Deductible amount
  copay_amount NUMERIC(12,2), -- Copay amount
  coinsurance_amount NUMERIC(12,2), -- Coinsurance amount

  -- Additional billing information
  diagnosis_codes TEXT[], -- ICD-10 diagnosis codes
  authorization_number TEXT, -- Prior authorization number if applicable
  claim_number TEXT, -- Insurance claim number

  -- OCR metadata
  confidence_score REAL DEFAULT 0.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0), -- OCR confidence (0.0 to 1.0)
  extraction_method TEXT DEFAULT 'google_vision', -- Method used for extraction
  raw_text TEXT, -- Raw OCR text for this line item

  -- Processing flags
  is_validated BOOLEAN DEFAULT FALSE, -- Whether the line item has been validated
  has_errors BOOLEAN DEFAULT FALSE, -- Whether errors were detected
  error_details JSONB, -- Details of any errors found

  -- Enhanced metadata
  source_document_page INTEGER DEFAULT 1, -- Page number if multi-page document
  extraction_confidence_details JSONB, -- Detailed confidence scores per field
  ai_processing_metadata JSONB, -- AI model and processing details

  -- Timestamps
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_line_items_session ON public.line_items(session_id);
CREATE INDEX idx_line_items_file ON public.line_items(file_id);
CREATE INDEX idx_line_items_case ON public.line_items(case_id);
CREATE INDEX idx_line_items_cpt ON public.line_items(cpt_code) WHERE cpt_code IS NOT NULL;
CREATE INDEX idx_line_items_service_date ON public.line_items(service_date) WHERE service_date IS NOT NULL;
CREATE INDEX idx_line_items_extracted_at ON public.line_items(extracted_at);
CREATE INDEX idx_line_items_extraction_method ON public.line_items(extraction_method);

-- Composite indexes for common queries
CREATE INDEX idx_line_items_case_file ON public.line_items(case_id, file_id);
CREATE INDEX idx_line_items_session_extracted ON public.line_items(session_id, extracted_at DESC);

-- Row Level Security
ALTER TABLE public.line_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy (allow public access for demo app)
CREATE POLICY "Allow public access to line_items" ON public.line_items
  FOR ALL USING (TRUE);

-- Grant permissions
GRANT ALL ON public.line_items TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.line_items_id_seq TO anon, authenticated;

-- Updated trigger function for updated_at
CREATE OR REPLACE FUNCTION update_line_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language plpgsql;

-- Add updated_at trigger
CREATE TRIGGER update_line_items_updated_at
  BEFORE UPDATE ON public.line_items
  FOR EACH ROW EXECUTE FUNCTION update_line_items_updated_at();

-- Create a view for easy querying of line items with file info
CREATE OR REPLACE VIEW public.line_items_with_files AS
SELECT
  li.*,
  f.file_name,
  f.file_type,
  f.file_size,
  f.storage_path,
  c.session_id as case_session_id,
  c.created_at as case_created_at
FROM public.line_items li
JOIN public.files f ON li.file_id = f.id
JOIN public.cases c ON li.case_id = c.id;

-- Grant permissions on the view
GRANT SELECT ON public.line_items_with_files TO anon, authenticated;

-- Create a summary function for line items per file
CREATE OR REPLACE FUNCTION get_line_items_summary(file_uuid UUID)
RETURNS TABLE (
  total_line_items BIGINT,
  avg_confidence REAL,
  extraction_methods TEXT[],
  total_charge_amount NUMERIC,
  date_range_start DATE,
  date_range_end DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_line_items,
    AVG(confidence_score)::REAL as avg_confidence,
    ARRAY_AGG(DISTINCT extraction_method) as extraction_methods,
    SUM(charge_amount) as total_charge_amount,
    MIN(service_date) as date_range_start,
    MAX(service_date) as date_range_end
  FROM public.line_items
  WHERE file_id = file_uuid;
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON TABLE public.line_items IS 'Stores extracted billing line items from medical documents processed via OCR';
COMMENT ON COLUMN public.line_items.confidence_score IS 'OCR confidence score between 0.0 and 1.0';
COMMENT ON COLUMN public.line_items.extraction_method IS 'OCR method used: google_vision, openai_vision, anthropic_claude, etc.';
COMMENT ON COLUMN public.line_items.raw_text IS 'Original OCR text for this line item for debugging and validation';