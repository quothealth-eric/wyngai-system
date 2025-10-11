-- Line Items Table Schema for Billing Information Storage
-- This table stores extracted billing line items from OCR processing
-- Run this SQL in Supabase SQL editor

-- LINE_ITEMS TABLE (extracted billing information)
CREATE TABLE IF NOT EXISTS public.line_items (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL, -- Links to cases.session_id for session isolation
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  -- Line item identification
  line_number INTEGER, -- Sequential line number in the document

  -- Billing codes and identifiers
  cpt_code TEXT, -- CPT/HCPCS procedure code (e.g., "99213", "J1200")
  code_description TEXT, -- Description of the procedure/service
  modifier_codes TEXT[], -- Modifier codes if any (e.g., ["-25", "-59"])

  -- Service details
  service_date DATE, -- Date of service
  place_of_service TEXT, -- Place of service code
  provider_npi TEXT, -- National Provider Identifier

  -- Financial information
  units INTEGER DEFAULT 1, -- Number of units
  charge_amount DECIMAL(10,2), -- Charged amount
  allowed_amount DECIMAL(10,2), -- Allowed amount by insurance
  paid_amount DECIMAL(10,2), -- Amount paid by insurance
  patient_responsibility DECIMAL(10,2), -- Patient responsibility amount
  deductible_amount DECIMAL(10,2), -- Deductible amount
  copay_amount DECIMAL(10,2), -- Copay amount
  coinsurance_amount DECIMAL(10,2), -- Coinsurance amount

  -- Additional billing information
  diagnosis_codes TEXT[], -- ICD-10 diagnosis codes
  authorization_number TEXT, -- Prior authorization number if applicable
  claim_number TEXT, -- Insurance claim number

  -- OCR metadata
  confidence_score REAL DEFAULT 0.0, -- OCR confidence (0.0 to 1.0)
  extraction_method TEXT DEFAULT 'ocr', -- Method used for extraction
  raw_text TEXT, -- Raw OCR text for this line item

  -- Processing flags
  is_validated BOOLEAN DEFAULT FALSE, -- Whether the line item has been validated
  has_errors BOOLEAN DEFAULT FALSE, -- Whether errors were detected
  error_details JSONB, -- Details of any errors found

  -- Timestamps
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_line_items_session ON public.line_items(session_id);
CREATE INDEX IF NOT EXISTS idx_line_items_file ON public.line_items(file_id);
CREATE INDEX IF NOT EXISTS idx_line_items_case ON public.line_items(case_id);
CREATE INDEX IF NOT EXISTS idx_line_items_cpt ON public.line_items(cpt_code);
CREATE INDEX IF NOT EXISTS idx_line_items_service_date ON public.line_items(service_date);
CREATE INDEX IF NOT EXISTS idx_line_items_extracted_at ON public.line_items(extracted_at);

-- Row Level Security
ALTER TABLE public.line_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy (allow public access for demo app)
CREATE POLICY "Allow public access to line_items" ON public.line_items
  FOR ALL USING (TRUE);

-- Grant permissions
GRANT ALL ON public.line_items TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.line_items_id_seq TO anon, authenticated;