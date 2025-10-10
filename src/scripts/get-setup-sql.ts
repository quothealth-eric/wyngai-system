// Script to get the SQL needed to create the line_items table
// Run with: npx tsx src/scripts/get-setup-sql.ts

console.log('🏗️ Getting SQL to create line_items table in Supabase...\n')

const SQL_TO_EXECUTE = `
-- Create line_items table for storing extracted billing line items
CREATE TABLE IF NOT EXISTS line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS idx_line_items_document_id ON line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_line_items_code ON line_items(code);
CREATE INDEX IF NOT EXISTS idx_line_items_code_type ON line_items(code_type);
CREATE INDEX IF NOT EXISTS idx_line_items_charge ON line_items(charge);
CREATE INDEX IF NOT EXISTS idx_line_items_date_of_service ON line_items(date_of_service);

-- Add missing columns to files table if they don't exist
ALTER TABLE files ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'uploaded';
ALTER TABLE files ADD COLUMN IF NOT EXISTS line_item_count INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Enable Row Level Security (optional - uncomment if needed)
-- ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations (adjust as needed)
-- CREATE POLICY "Allow all operations on line_items" ON line_items FOR ALL USING (true);
`

console.log('📋 INSTRUCTIONS:')
console.log('1. Go to your Supabase project dashboard')
console.log('2. Navigate to SQL Editor')
console.log('3. Copy the SQL below and paste it into the editor')
console.log('4. Click "Run" to execute')
console.log('5. Return to your application and test uploading a document')
console.log('\n🔗 Supabase Dashboard: https://app.supabase.com')
console.log('\n📄 SQL TO EXECUTE:')
console.log('='.repeat(80))
console.log(SQL_TO_EXECUTE)
console.log('='.repeat(80))
console.log('\n✅ After running this SQL, your line_items table will be created and ready to store extracted billing data!')
console.log('\n🧪 You can verify the setup by visiting: /admin/database-setup after deploying')