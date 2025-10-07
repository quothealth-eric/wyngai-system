-- Chat cases table for comprehensive chat system
CREATE TABLE IF NOT EXISTS chat_cases (
  id SERIAL PRIMARY KEY,
  case_id VARCHAR(255) UNIQUE NOT NULL,
  narrative TEXT NOT NULL,
  themes TEXT[] DEFAULT '{}',
  artifacts_count INTEGER DEFAULT 0,
  confidence_score INTEGER DEFAULT 0,
  has_documents BOOLEAN DEFAULT false,
  follow_up_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_chat_cases_case_id ON chat_cases(case_id);
CREATE INDEX IF NOT EXISTS idx_chat_cases_created_at ON chat_cases(created_at);

-- Chat case artifacts table for storing document metadata
CREATE TABLE IF NOT EXISTS chat_case_artifacts (
  id SERIAL PRIMARY KEY,
  case_id VARCHAR(255) REFERENCES chat_cases(case_id) ON DELETE CASCADE,
  artifact_id VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  doc_type VARCHAR(20) NOT NULL, -- 'EOB', 'BILL', 'LETTER', 'PORTAL', 'UNKNOWN'
  pages INTEGER DEFAULT 1,
  ocr_confidence DECIMAL(3,2) DEFAULT 0.85,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for artifacts
CREATE INDEX IF NOT EXISTS idx_chat_case_artifacts_case_id ON chat_case_artifacts(case_id);

-- Chat case detections table for storing analysis results
CREATE TABLE IF NOT EXISTS chat_case_detections (
  id SERIAL PRIMARY KEY,
  case_id VARCHAR(255) REFERENCES chat_cases(case_id) ON DELETE CASCADE,
  category VARCHAR(255) NOT NULL,
  severity VARCHAR(10) NOT NULL, -- 'info', 'warn', 'high'
  explanation TEXT NOT NULL,
  evidence JSONB DEFAULT '{}',
  policy_citations JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for detections
CREATE INDEX IF NOT EXISTS idx_chat_case_detections_case_id ON chat_case_detections(case_id);
CREATE INDEX IF NOT EXISTS idx_chat_case_detections_category ON chat_case_detections(category);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to chat_cases table
DROP TRIGGER IF EXISTS update_chat_cases_updated_at ON chat_cases;
CREATE TRIGGER update_chat_cases_updated_at
  BEFORE UPDATE ON chat_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();