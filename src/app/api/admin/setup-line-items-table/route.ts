import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function POST(request: NextRequest) {
  console.log('🔧 Setting up line_items table in Supabase')

  try {
    // Line Items Table Schema
    const createTableSQL = `
      -- LINE_ITEMS TABLE (extracted billing information)
      CREATE TABLE IF NOT EXISTS public.line_items (
        id BIGSERIAL PRIMARY KEY,
        session_id UUID NOT NULL, -- Links to cases.session_id for session isolation
        file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
        case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

        -- Line item identification
        line_number INTEGER, -- Sequential line number in the document

        -- Billing codes and identifiers
        cpt_code TEXT, -- CPT/HCPCS procedure code (e.g., "99213", "J1200")
        code_description TEXT, -- Description of the procedure/service
        modifier_codes TEXT[], -- Modifier codes if any (e.g., ["-25", "-59"])

        -- Service details
        service_date DATE, -- Date of service
        place_of_service TEXT, -- Place of service code
        provider_npi TEXT, -- National Provider Identifier

        -- Financial information
        units INTEGER DEFAULT 1, -- Number of units
        charge_amount DECIMAL(10,2), -- Charged amount
        allowed_amount DECIMAL(10,2), -- Allowed amount by insurance
        paid_amount DECIMAL(10,2), -- Amount paid by insurance
        patient_responsibility DECIMAL(10,2), -- Patient responsibility amount
        deductible_amount DECIMAL(10,2), -- Deductible amount
        copay_amount DECIMAL(10,2), -- Copay amount
        coinsurance_amount DECIMAL(10,2), -- Coinsurance amount

        -- Additional billing information
        diagnosis_codes TEXT[], -- ICD-10 diagnosis codes
        authorization_number TEXT, -- Prior authorization number if applicable
        claim_number TEXT, -- Insurance claim number

        -- OCR metadata
        confidence_score REAL DEFAULT 0.0, -- OCR confidence (0.0 to 1.0)
        extraction_method TEXT DEFAULT 'ocr', -- Method used for extraction
        raw_text TEXT, -- Raw OCR text for this line item

        -- Processing flags
        is_validated BOOLEAN DEFAULT FALSE, -- Whether the line item has been validated
        has_errors BOOLEAN DEFAULT FALSE, -- Whether errors were detected
        error_details JSONB, -- Details of any errors found

        -- Timestamps
        extracted_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `

    const createIndexesSQL = `
      -- INDEXES for performance
      CREATE INDEX IF NOT EXISTS idx_line_items_session ON public.line_items(session_id);
      CREATE INDEX IF NOT EXISTS idx_line_items_file ON public.line_items(file_id);
      CREATE INDEX IF NOT EXISTS idx_line_items_case ON public.line_items(case_id);
      CREATE INDEX IF NOT EXISTS idx_line_items_cpt ON public.line_items(cpt_code);
      CREATE INDEX IF NOT EXISTS idx_line_items_service_date ON public.line_items(service_date);
      CREATE INDEX IF NOT EXISTS idx_line_items_extracted_at ON public.line_items(extracted_at);
    `

    const setupRLSSQL = `
      -- Row Level Security
      ALTER TABLE public.line_items ENABLE ROW LEVEL SECURITY;

      -- RLS Policy (allow public access for demo app)
      CREATE POLICY IF NOT EXISTS "Allow public access to line_items" ON public.line_items
        FOR ALL USING (TRUE);
    `

    const grantPermissionsSQL = `
      -- Grant permissions
      GRANT ALL ON public.line_items TO anon, authenticated;
      GRANT USAGE ON SEQUENCE public.line_items_id_seq TO anon, authenticated;
    `

    console.log('🏗️ Creating line_items table...')
    const { error: createError } = await supabase.rpc('exec_sql', {
      sql: createTableSQL
    })

    if (createError) {
      // Try alternative approach using direct query
      const { error: directError } = await supabase
        .from('pg_tables')
        .select('tablename')
        .eq('tablename', 'line_items')
        .single()

      if (directError && directError.code === 'PGRST116') {
        // Table doesn't exist, let's try to create it manually
        console.log('📋 Table does not exist, manual creation needed')

        return NextResponse.json({
          success: false,
          message: 'Table creation requires manual SQL execution',
          sqlToRun: createTableSQL + createIndexesSQL + setupRLSSQL + grantPermissionsSQL,
          instructions: [
            '1. Go to Supabase Dashboard → SQL Editor',
            '2. Run the provided SQL script',
            '3. Verify table creation',
            '4. Test the /api/analyze endpoint'
          ]
        })
      }
    }

    console.log('📊 Creating indexes...')
    await supabase.rpc('exec_sql', { sql: createIndexesSQL })

    console.log('🔒 Setting up RLS...')
    await supabase.rpc('exec_sql', { sql: setupRLSSQL })

    console.log('🔑 Granting permissions...')
    await supabase.rpc('exec_sql', { sql: grantPermissionsSQL })

    // Verify table creation
    const { data: tableCheck, error: checkError } = await supabase
      .from('line_items')
      .select('id')
      .limit(1)

    if (checkError) {
      return NextResponse.json({
        success: false,
        message: 'Table creation verification failed',
        error: checkError.message,
        sqlToRun: createTableSQL + createIndexesSQL + setupRLSSQL + grantPermissionsSQL
      })
    }

    console.log('✅ Line items table setup completed successfully')

    return NextResponse.json({
      success: true,
      message: 'Line items table created successfully',
      tableExists: true,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Failed to setup line_items table:', error)

    return NextResponse.json({
      success: false,
      message: 'Failed to setup line_items table',
      error: error instanceof Error ? error.message : 'Unknown error',
      sqlToRun: `-- Run this SQL in Supabase Dashboard → SQL Editor
-- LINE_ITEMS TABLE (extracted billing information)
CREATE TABLE IF NOT EXISTS public.line_items (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  line_number INTEGER,
  cpt_code TEXT,
  code_description TEXT,
  modifier_codes TEXT[],
  service_date DATE,
  place_of_service TEXT,
  provider_npi TEXT,
  units INTEGER DEFAULT 1,
  charge_amount DECIMAL(10,2),
  allowed_amount DECIMAL(10,2),
  paid_amount DECIMAL(10,2),
  patient_responsibility DECIMAL(10,2),
  deductible_amount DECIMAL(10,2),
  copay_amount DECIMAL(10,2),
  coinsurance_amount DECIMAL(10,2),
  diagnosis_codes TEXT[],
  authorization_number TEXT,
  claim_number TEXT,
  confidence_score REAL DEFAULT 0.0,
  extraction_method TEXT DEFAULT 'ocr',
  raw_text TEXT,
  is_validated BOOLEAN DEFAULT FALSE,
  has_errors BOOLEAN DEFAULT FALSE,
  error_details JSONB,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_line_items_session ON public.line_items(session_id);
CREATE INDEX IF NOT EXISTS idx_line_items_file ON public.line_items(file_id);
CREATE INDEX IF NOT EXISTS idx_line_items_case ON public.line_items(case_id);
CREATE INDEX IF NOT EXISTS idx_line_items_cpt ON public.line_items(cpt_code);
CREATE INDEX IF NOT EXISTS idx_line_items_service_date ON public.line_items(service_date);
CREATE INDEX IF NOT EXISTS idx_line_items_extracted_at ON public.line_items(extracted_at);

-- Row Level Security
ALTER TABLE public.line_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy (allow public access for demo app)
CREATE POLICY IF NOT EXISTS "Allow public access to line_items" ON public.line_items
  FOR ALL USING (TRUE);

-- Grant permissions
GRANT ALL ON public.line_items TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.line_items_id_seq TO anon, authenticated;`
    }, { status: 500 })
  }
}

export async function GET() {
  // Check if table exists
  try {
    const { data, error } = await supabase
      .from('line_items')
      .select('id')
      .limit(1)

    if (error) {
      return NextResponse.json({
        tableExists: false,
        error: error.message,
        needsSetup: true
      })
    }

    return NextResponse.json({
      tableExists: true,
      message: 'Line items table is ready',
      needsSetup: false
    })

  } catch (error) {
    return NextResponse.json({
      tableExists: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      needsSetup: true
    })
  }
}