import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function POST(request: NextRequest) {
  console.log('🏗️ Setting up database schema...')

  try {
    // First, let's try to check if the table already exists
    const { data: existingTable, error: checkError } = await supabase
      .from('line_items')
      .select('id')
      .limit(1)

    if (!checkError) {
      console.log('✅ Line items table already exists')
      return NextResponse.json({
        success: true,
        message: 'Database schema already set up',
        tableExists: true
      })
    }

    console.log('🔧 Line items table does not exist, creating...')

    // Create line_items table using Supabase's SQL functionality
    // We'll use a workaround by creating a stored procedure

    // First, create the table structure by inserting a dummy row that will fail
    // but will create the table structure in the process
    try {
      // This is a workaround - we'll manually execute the SQL via the management API

      // Alternative approach: Use Supabase's RPC functionality
      const { data: rpcResult, error: rpcError } = await supabase.rpc('exec_sql', {
        query: `
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

      if (rpcError) {
        console.log('RPC method not available, trying alternative approach...')

        // Since RPC might not be available, let's try a different approach
        // We'll create a simple test insert that will fail but might create the table

        // Return instructions for manual setup instead
        return NextResponse.json({
          success: false,
          message: 'Cannot create table programmatically. Manual setup required.',
          instructions: {
            step1: 'Go to your Supabase project dashboard',
            step2: 'Navigate to SQL Editor',
            step3: 'Run the following SQL:',
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
            `,
            step4: 'Click "Run" to execute the SQL',
            step5: 'Then call this API again to verify setup'
          }
        })
      }

      console.log('✅ Database schema created successfully')

    } catch (sqlError) {
      console.error('SQL execution failed:', sqlError)

      return NextResponse.json({
        success: false,
        message: 'Failed to execute SQL',
        error: sqlError,
        manualSetupRequired: true
      })
    }

    // Verify the table was created
    const { data: verifyData, error: verifyError } = await supabase
      .from('line_items')
      .select('id')
      .limit(1)

    if (verifyError) {
      console.error('❌ Table verification failed:', verifyError)
      return NextResponse.json({
        success: false,
        message: 'Table creation verification failed',
        error: verifyError.message
      })
    }

    console.log('✅ Line items table verified successfully')

    return NextResponse.json({
      success: true,
      message: 'Database schema created and verified',
      tableExists: true
    })

  } catch (error) {
    console.error('❌ Database setup failed:', error)
    return NextResponse.json({
      success: false,
      message: 'Database setup failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  // Check current database status
  try {
    const { data: filesData, error: filesError } = await supabase
      .from('files')
      .select('id')
      .limit(1)

    const { data: lineItemsData, error: lineItemsError } = await supabase
      .from('line_items')
      .select('id')
      .limit(1)

    return NextResponse.json({
      status: {
        files_table: filesError ? 'missing' : 'exists',
        line_items_table: lineItemsError ? 'missing' : 'exists',
      },
      errors: {
        files: filesError?.message,
        line_items: lineItemsError?.message
      }
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to check database status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}