import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  console.log('🚀 Creating line_items table in Supabase...')

  try {
    // Initialize Supabase client with service role key for admin operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if table already exists
    const { data: existingCheck, error: checkError } = await supabase
      .from('line_items')
      .select('id')
      .limit(1)

    if (!checkError) {
      console.log('✅ Line items table already exists')
      return NextResponse.json({
        success: true,
        message: 'Line items table already exists',
        alreadyExists: true
      })
    }

    console.log('📋 Table does not exist. Here is the SQL to create it manually:')

    const createTableSQL = `
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

-- Enable Row Level Security (if needed)
-- ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations (adjust as needed)
-- CREATE POLICY "Allow all operations on line_items" ON line_items FOR ALL USING (true);
    `

    // Since we can't execute raw SQL directly through the client library,
    // we'll return the SQL for manual execution
    return NextResponse.json({
      success: false,
      requiresManualSetup: true,
      message: 'Please execute the following SQL in your Supabase SQL Editor',
      sql: createTableSQL,
      instructions: [
        '1. Go to your Supabase project dashboard',
        '2. Navigate to SQL Editor',
        '3. Copy and paste the SQL provided above',
        '4. Click "Run" to execute',
        '5. Refresh this page to verify the table was created'
      ],
      setupUrl: 'https://app.supabase.com/project/YOUR_PROJECT_ID/sql'
    })

  } catch (error) {
    console.error('❌ Setup failed:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to set up database',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  // Check current database status
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check files table
    const { data: filesData, error: filesError } = await supabase
      .from('files')
      .select('count(*)', { count: 'exact', head: true })

    // Check line_items table
    const { data: lineItemsData, error: lineItemsError } = await supabase
      .from('line_items')
      .select('count(*)', { count: 'exact', head: true })

    // Get recent files for debugging
    const { data: recentFiles } = await supabase
      .from('files')
      .select('id, file_name, ocr_text, created_at')
      .order('created_at', { ascending: false })
      .limit(3)

    return NextResponse.json({
      status: 'Database Status Check',
      tables: {
        files: {
          exists: !filesError,
          error: filesError?.message,
          count: filesData?.length || 0
        },
        line_items: {
          exists: !lineItemsError,
          error: lineItemsError?.message,
          count: lineItemsData?.length || 0
        }
      },
      recentFiles: recentFiles?.map(f => ({
        id: f.id,
        name: f.file_name,
        ocrLength: f.ocr_text?.length || 0,
        created: f.created_at
      })) || []
    })

  } catch (error) {
    return NextResponse.json({
      error: 'Failed to check database status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}