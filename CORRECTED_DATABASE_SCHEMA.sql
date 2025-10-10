-- CORRECTED DATABASE SCHEMA FOR WYNG AI SYSTEM
-- This SQL script creates the proper data flow for document sessions and OCR processing

-- =====================================================
-- PART 1: CREATE MISSING TABLES AND MODIFY EXISTING ONES
-- =====================================================

-- Create document_sessions table to group related documents
CREATE TABLE IF NOT EXISTS document_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_type TEXT NOT NULL CHECK (session_type IN ('bill_analysis', 'chat')),
    user_description TEXT,
    status TEXT DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'completed', 'failed')),
    total_documents INTEGER DEFAULT 0,
    total_charges DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Modify existing files table to reference document sessions
ALTER TABLE files ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES document_sessions(id) ON DELETE CASCADE;
ALTER TABLE files ADD COLUMN IF NOT EXISTS document_number INTEGER DEFAULT 1; -- 1st, 2nd, 3rd document in session
ALTER TABLE files ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'uploaded';

-- Ensure line_items table exists with proper structure
CREATE TABLE IF NOT EXISTS line_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES document_sessions(id) ON DELETE CASCADE,
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
    extraction_confidence DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create compliance_findings table to store analysis results
CREATE TABLE IF NOT EXISTS compliance_findings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES document_sessions(id) ON DELETE CASCADE,
    detector_id INTEGER NOT NULL,
    detector_name TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('info', 'warn', 'high')) DEFAULT 'info',
    affected_line_items UUID[] DEFAULT '{}',
    rationale TEXT,
    suggested_docs TEXT[],
    policy_citations TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================
-- PART 2: CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Document sessions indexes
CREATE INDEX IF NOT EXISTS idx_document_sessions_type ON document_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_document_sessions_status ON document_sessions(status);
CREATE INDEX IF NOT EXISTS idx_document_sessions_created ON document_sessions(created_at);

-- Files table indexes
CREATE INDEX IF NOT EXISTS idx_files_session_id ON files(session_id);
CREATE INDEX IF NOT EXISTS idx_files_document_number ON files(document_number);
CREATE INDEX IF NOT EXISTS idx_files_processing_status ON files(processing_status);

-- Line items indexes (enhanced)
CREATE INDEX IF NOT EXISTS idx_line_items_session_id ON line_items(session_id);
CREATE INDEX IF NOT EXISTS idx_line_items_document_id ON line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_line_items_code ON line_items(code);
CREATE INDEX IF NOT EXISTS idx_line_items_code_type ON line_items(code_type);
CREATE INDEX IF NOT EXISTS idx_line_items_charge ON line_items(charge);
CREATE INDEX IF NOT EXISTS idx_line_items_date_of_service ON line_items(date_of_service);

-- Compliance findings indexes
CREATE INDEX IF NOT EXISTS idx_compliance_findings_session_id ON compliance_findings(session_id);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_severity ON compliance_findings(severity);

-- =====================================================
-- PART 3: CREATE UPDATED TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at columns
DROP TRIGGER IF EXISTS update_document_sessions_updated_at ON document_sessions;
CREATE TRIGGER update_document_sessions_updated_at
    BEFORE UPDATE ON document_sessions
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

-- =====================================================
-- PART 4: CREATE HELPER FUNCTIONS FOR DATA FLOW
-- =====================================================

-- Function to update session totals when line items change
CREATE OR REPLACE FUNCTION update_session_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Update document session totals
    UPDATE document_sessions
    SET
        total_charges = (
            SELECT COALESCE(SUM(charge), 0)
            FROM line_items
            WHERE session_id = COALESCE(NEW.session_id, OLD.session_id)
        ),
        total_documents = (
            SELECT COUNT(DISTINCT document_id)
            FROM line_items
            WHERE session_id = COALESCE(NEW.session_id, OLD.session_id)
        )
    WHERE id = COALESCE(NEW.session_id, OLD.session_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Trigger to automatically update session totals
DROP TRIGGER IF EXISTS update_session_totals_trigger ON line_items;
CREATE TRIGGER update_session_totals_trigger
    AFTER INSERT OR UPDATE OR DELETE ON line_items
    FOR EACH ROW
    EXECUTE FUNCTION update_session_totals();

-- =====================================================
-- PART 5: DATA MIGRATION FOR EXISTING RECORDS
-- =====================================================

-- Create sessions for existing files that don't have sessions
INSERT INTO document_sessions (session_type, status, user_description)
SELECT DISTINCT
    'bill_analysis' as session_type,
    'completed' as status,
    'Migrated from individual files' as user_description
FROM files
WHERE session_id IS NULL
AND NOT EXISTS (
    SELECT 1 FROM document_sessions WHERE session_type = 'bill_analysis' AND user_description = 'Migrated from individual files'
);

-- Update existing files to reference the migrated session
UPDATE files
SET session_id = (
    SELECT id FROM document_sessions
    WHERE session_type = 'bill_analysis'
    AND user_description = 'Migrated from individual files'
    LIMIT 1
)
WHERE session_id IS NULL;

-- =====================================================
-- PART 6: VERIFY SCHEMA SETUP
-- =====================================================

-- View to check the complete data flow
CREATE OR REPLACE VIEW data_flow_summary AS
SELECT
    ds.id as session_id,
    ds.session_type,
    ds.status as session_status,
    COUNT(DISTINCT f.id) as document_count,
    COUNT(li.id) as line_item_count,
    COALESCE(SUM(li.charge), 0) as total_charges,
    COUNT(cf.id) as findings_count,
    ds.created_at
FROM document_sessions ds
LEFT JOIN files f ON f.session_id = ds.id
LEFT JOIN line_items li ON li.session_id = ds.id
LEFT JOIN compliance_findings cf ON cf.session_id = ds.id
GROUP BY ds.id, ds.session_type, ds.status, ds.created_at
ORDER BY ds.created_at DESC;

-- =====================================================
-- PART 7: ROW LEVEL SECURITY (OPTIONAL)
-- =====================================================

-- Enable RLS if needed (uncomment if you want user-level security)
-- ALTER TABLE document_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE files ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE compliance_findings ENABLE ROW LEVEL SECURITY;

-- Example policies (customize as needed)
-- CREATE POLICY "Users can view their own sessions" ON document_sessions FOR SELECT USING (true);
-- CREATE POLICY "Users can create sessions" ON document_sessions FOR INSERT WITH CHECK (true);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check table structure
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name IN ('document_sessions', 'files', 'line_items', 'compliance_findings')
ORDER BY table_name, ordinal_position;

-- Check current data
SELECT * FROM data_flow_summary;

-- Check indexes
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('document_sessions', 'files', 'line_items', 'compliance_findings')
ORDER BY tablename, indexname;