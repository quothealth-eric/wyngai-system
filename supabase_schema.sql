-- Supabase Database Schema for WyngAI Medical Bill Analyzer
-- This script ensures all required tables exist for the bill analysis system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cases table (existing, likely already exists)
CREATE TABLE IF NOT EXISTS cases (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_question TEXT,
    llm_response JSONB,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Files table for storing uploaded documents
CREATE TABLE IF NOT EXISTS files (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    ocr_text TEXT,
    ocr_confidence REAL DEFAULT 0,
    status TEXT DEFAULT 'uploaded',
    line_item_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Line items table for storing extracted billing line items
CREATE TABLE IF NOT EXISTS line_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id UUID REFERENCES files(id) ON DELETE CASCADE,
    page_number INTEGER DEFAULT 1,
    line_number INTEGER NOT NULL,
    code TEXT,
    code_type TEXT CHECK (code_type IN ('CPT', 'HCPCS', 'REV', 'GENERIC', 'UNKNOWN')) DEFAULT 'UNKNOWN',
    description TEXT,
    units INTEGER DEFAULT 1,
    charge DECIMAL(10,2),
    date_of_service DATE,
    modifiers TEXT[],
    raw_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_files_case_id ON files(case_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_line_items_document_id ON line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_line_items_code ON line_items(code);
CREATE INDEX IF NOT EXISTS idx_line_items_code_type ON line_items(code_type);
CREATE INDEX IF NOT EXISTS idx_line_items_charge ON line_items(charge);
CREATE INDEX IF NOT EXISTS idx_line_items_date_of_service ON line_items(date_of_service);

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_cases_updated_at ON cases;
CREATE TRIGGER update_cases_updated_at
    BEFORE UPDATE ON cases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_files_updated_at ON files;
CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_line_items_updated_at ON line_items;
CREATE TRIGGER update_line_items_updated_at
    BEFORE UPDATE ON line_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security policies (if needed)
-- ALTER TABLE files ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL ON files TO authenticated;
-- GRANT ALL ON line_items TO authenticated;
-- GRANT USAGE ON SEQUENCE files_id_seq TO authenticated;
-- GRANT USAGE ON SEQUENCE line_items_id_seq TO authenticated;

-- Verification queries to check schema
-- SELECT table_name, column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name IN ('files', 'line_items')
-- ORDER BY table_name, ordinal_position;