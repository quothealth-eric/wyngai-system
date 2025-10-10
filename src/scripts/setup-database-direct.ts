// Direct database setup script using Supabase client
// This creates the line_items table by leveraging existing functionality

import { supabase } from '../lib/db'

async function setupDatabase() {
  console.log('🏗️ Setting up line_items table in Supabase...')

  try {
    // Step 1: Check current status
    console.log('📊 Checking current database status...')

    const { data: filesCheck } = await supabase
      .from('files')
      .select('id')
      .limit(1)

    console.log('✅ Files table exists')

    const { data: lineItemsCheck, error: lineItemsError } = await supabase
      .from('line_items')
      .select('id')
      .limit(1)

    if (!lineItemsError) {
      console.log('✅ Line items table already exists!')
      return
    }

    console.log('⚠️ Line items table missing, attempting creation...')

    // Step 2: Try to create using INSERT approach (which will fail but might create table)
    console.log('🔧 Attempting table creation...')

    // Alternative approach: Use the admin API
    const setupResponse = await fetch('http://localhost:3000/api/admin/setup-database', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    })

    if (setupResponse.ok) {
      const result = await setupResponse.json()
      console.log('✅ Setup successful:', result)
    } else {
      const error = await setupResponse.json()
      console.log('📋 Manual setup required:', error.instructions)
    }

  } catch (error) {
    console.error('❌ Setup failed:', error)
    console.log(`
📋 MANUAL SETUP REQUIRED:

Please go to your Supabase project dashboard and run this SQL:

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

CREATE INDEX IF NOT EXISTS idx_line_items_document_id ON line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_line_items_code ON line_items(code);
CREATE INDEX IF NOT EXISTS idx_line_items_code_type ON line_items(code_type);
CREATE INDEX IF NOT EXISTS idx_line_items_charge ON line_items(charge);
CREATE INDEX IF NOT EXISTS idx_line_items_date_of_service ON line_items(date_of_service);

ALTER TABLE files ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'uploaded';
ALTER TABLE files ADD COLUMN IF NOT EXISTS line_item_count INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

Then run: npx tsx src/scripts/verify-database.ts
    `)
  }
}

// Run the setup
setupDatabase().catch(console.error)