-- Admin Workbench Schema Migration
-- Creates the complete database schema for case management system

-- Create private bucket for case files
INSERT INTO storage.buckets (id, name, public)
VALUES ('wyng_cases', 'wyng_cases', false)
ON CONFLICT (id) DO NOTHING;

-- Core cases table
CREATE TABLE IF NOT EXISTS public.cases (
  case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'submitted', -- submitted|processing|ready|emailed|archived
  submit_email text,               -- captured on email page
  user_ip inet,
  user_agent text
);

-- Case profile (description + insurance details)
CREATE TABLE IF NOT EXISTS public.case_profile (
  case_id uuid PRIMARY KEY REFERENCES public.cases(case_id) ON DELETE CASCADE,
  description text,
  insurance jsonb,                 -- {planType, network, deductible, coinsurance, memberIdMasked, ...}
  provided_at timestamptz DEFAULT now()
);

-- Case files (uploaded documents)
CREATE TABLE IF NOT EXISTS public.case_files (
  id bigserial PRIMARY KEY,
  case_id uuid REFERENCES public.cases(case_id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime text NOT NULL,
  size_bytes bigint,
  storage_path text NOT NULL,      -- storage path in bucket (e.g., case/<caseId>/<artifactId>/<filename>)
  document_type text DEFAULT 'bill', -- bill|eob|letter|portal|insurance_card|unknown
  uploaded_at timestamptz DEFAULT now()
);

-- OCR extractions (normalized billing lines & key facts)
CREATE TABLE IF NOT EXISTS public.ocr_extractions (
  id bigserial PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  file_id bigint REFERENCES public.case_files(id) ON DELETE CASCADE,
  page int NOT NULL,
  row_idx int NOT NULL,
  doc_type text,                   -- BILL|EOB|LETTER|PORTAL|INSURANCE_CARD|UNKNOWN
  code text,
  code_system text,                -- CPT|HCPCS|REV|POS
  modifiers text[],
  description text,
  units numeric,
  dos date,
  pos text,
  rev_code text,
  npi text,
  charge_cents int,
  allowed_cents int,
  plan_paid_cents int,
  patient_resp_cents int,
  keyfacts jsonb,
  low_conf boolean DEFAULT false,
  vendor_confidence real,
  validators jsonb,
  created_at timestamptz DEFAULT now()
);

-- Rule engine detections (18-rule findings)
CREATE TABLE IF NOT EXISTS public.case_detections (
  id bigserial PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  severity text NOT NULL,          -- info|warn|high
  explanation text NOT NULL,
  evidence jsonb,
  citations jsonb,
  savings_cents int DEFAULT 0,    -- Potential savings for this detection
  created_at timestamptz DEFAULT now()
);

-- Admin-edited final reports
CREATE TABLE IF NOT EXISTS public.case_reports (
  case_id uuid PRIMARY KEY REFERENCES public.cases(case_id) ON DELETE CASCADE,
  draft jsonb,                     -- Admin-editable structured report (summary + issues + scripts + letters)
  finalized jsonb,                 -- Locked copy when emailed
  analysis_data jsonb,             -- Comprehensive analysis data for report generation
  report_path text,                -- Path to generated PDF report
  emailed_at timestamptz,
  email_to text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Audit logging
CREATE TABLE IF NOT EXISTS public.case_audit (
  id bigserial PRIMARY KEY,
  case_id uuid REFERENCES public.cases(case_id) ON DELETE CASCADE,
  event text NOT NULL,
  admin_identifier text,
  details jsonb,
  ip_address inet,
  created_at timestamptz DEFAULT now()
);

-- Helper view for admin dashboard
CREATE OR REPLACE VIEW public.v_case_summary AS
SELECT
  c.case_id,
  c.created_at,
  c.status,
  c.submit_email,
  cp.description,
  (SELECT count(*) FROM public.case_files f WHERE f.case_id = c.case_id) as file_count,
  (SELECT count(*) FROM public.case_detections d WHERE d.case_id = c.case_id) as detection_count,
  (SELECT count(*) FROM public.ocr_extractions o WHERE o.case_id = c.case_id) as extraction_count,
  cr.emailed_at
FROM public.cases c
LEFT JOIN public.case_profile cp ON cp.case_id = c.case_id
LEFT JOIN public.case_reports cr ON cr.case_id = c.case_id
ORDER BY c.created_at DESC;

-- Storage policies (RLS disabled for admin access via service role)
-- Admin will access via server-side service role, not direct client access

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON public.cases(created_at);
CREATE INDEX IF NOT EXISTS idx_case_files_case_id ON public.case_files(case_id);
CREATE INDEX IF NOT EXISTS idx_ocr_extractions_case_id ON public.ocr_extractions(case_id);
CREATE INDEX IF NOT EXISTS idx_case_detections_case_id ON public.case_detections(case_id);
CREATE INDEX IF NOT EXISTS idx_case_audit_case_id ON public.case_audit(case_id);