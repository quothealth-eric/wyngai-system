-- Migration to add missing columns for enhanced analysis
-- This fixes the production deployment issue where citations column is missing

-- Add citations column to case_detections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'case_detections'
        AND column_name = 'citations'
    ) THEN
        ALTER TABLE public.case_detections
        ADD COLUMN citations jsonb;
    END IF;
END $$;

-- Add savings_cents column to case_detections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'case_detections'
        AND column_name = 'savings_cents'
    ) THEN
        ALTER TABLE public.case_detections
        ADD COLUMN savings_cents int DEFAULT 0;
    END IF;
END $$;

-- Add document_type column to case_files if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'case_files'
        AND column_name = 'document_type'
    ) THEN
        ALTER TABLE public.case_files
        ADD COLUMN document_type text DEFAULT 'bill';
    END IF;
END $$;

-- Add analysis_data column to case_reports if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'case_reports'
        AND column_name = 'analysis_data'
    ) THEN
        ALTER TABLE public.case_reports
        ADD COLUMN analysis_data jsonb;
    END IF;
END $$;

-- Add report_path column to case_reports if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'case_reports'
        AND column_name = 'report_path'
    ) THEN
        ALTER TABLE public.case_reports
        ADD COLUMN report_path text;
    END IF;
END $$;

-- Add created_at column to case_reports if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'case_reports'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.case_reports
        ADD COLUMN created_at timestamptz DEFAULT now();
    END IF;
END $$;

-- Add updated_at column to case_reports if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'case_reports'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.case_reports
        ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_detections_rule_key
ON public.case_detections(rule_key);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_detections_savings
ON public.case_detections(savings_cents) WHERE savings_cents > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_files_document_type
ON public.case_files(document_type);

-- Add comments for documentation
COMMENT ON COLUMN public.case_detections.citations IS 'Regulatory citations for this detection (CMS, Federal, State DOI, Payer policies)';
COMMENT ON COLUMN public.case_detections.savings_cents IS 'Potential member savings for this detection in cents';
COMMENT ON COLUMN public.case_files.document_type IS 'Type of document: bill|eob|letter|portal|insurance_card|unknown';
COMMENT ON COLUMN public.case_reports.analysis_data IS 'Comprehensive analysis data for enhanced report generation';
COMMENT ON COLUMN public.case_reports.report_path IS 'Storage path to generated PDF report';