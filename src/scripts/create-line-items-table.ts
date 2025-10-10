// Script to create the line_items table in Supabase
// Run with: npx tsx src/scripts/create-line-items-table.ts

import { supabase } from '../lib/db'

async function createLineItemsTable() {
  console.log('🏗️ Creating line_items table in Supabase...')

  try {
    // Create the line_items table using raw SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    })

    if (error) {
      console.error('❌ Failed to create table using RPC:', error)

      // Try alternative approach - direct table creation
      console.log('🔄 Trying alternative approach...')

      // Since we can't use raw SQL directly, we'll need to guide the user
      console.log('📋 Manual setup required. Please run this SQL in your Supabase SQL editor:')
      console.log(`
-- Line Items Table Creation SQL
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_line_items_document_id ON line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_line_items_code ON line_items(code);
CREATE INDEX IF NOT EXISTS idx_line_items_code_type ON line_items(code_type);
CREATE INDEX IF NOT EXISTS idx_line_items_charge ON line_items(charge);
CREATE INDEX IF NOT EXISTS idx_line_items_date_of_service ON line_items(date_of_service);

-- Add missing columns to files table
ALTER TABLE files ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'uploaded';
ALTER TABLE files ADD COLUMN IF NOT EXISTS line_item_count INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
      `)

    } else {
      console.log('✅ Table creation successful:', data)
    }

    // Verify the table was created
    console.log('🔍 Verifying table creation...')
    const { data: testData, error: testError } = await supabase
      .from('line_items')
      .select('*')
      .limit(1)

    if (testError) {
      console.error('❌ Table verification failed:', testError)
    } else {
      console.log('✅ Line items table is now accessible')
    }

  } catch (error) {
    console.error('❌ Setup failed:', error)
  }
}

// Run the setup
createLineItemsTable().catch(console.error)