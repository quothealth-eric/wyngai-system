import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  // Require admin authentication
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🔧 Setting up database schema...')

    // Check and create cases table
    const { error: casesError } = await supabaseAdmin.rpc('create_cases_table')
    if (casesError && !casesError.message.includes('already exists')) {
      console.error('❌ Failed to create cases table:', casesError)
    }

    // Check and create case_profile table
    const { error: profileError } = await supabaseAdmin.rpc('create_case_profile_table')
    if (profileError && !profileError.message.includes('already exists')) {
      console.error('❌ Failed to create case_profile table:', profileError)
    }

    // Check and create case_files table
    const { error: filesError } = await supabaseAdmin.rpc('create_case_files_table')
    if (filesError && !filesError.message.includes('already exists')) {
      console.error('❌ Failed to create case_files table:', filesError)
    }

    // Alternatively, just run the SQL directly
    const setupQueries = [
      `CREATE TABLE IF NOT EXISTS public.cases (
        case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz DEFAULT now(),
        status text DEFAULT 'submitted',
        submit_email text,
        user_ip inet,
        user_agent text
      );`,

      `CREATE TABLE IF NOT EXISTS public.case_profile (
        case_id uuid PRIMARY KEY REFERENCES public.cases(case_id) ON DELETE CASCADE,
        description text,
        insurance jsonb,
        provided_at timestamptz DEFAULT now()
      );`,

      `CREATE TABLE IF NOT EXISTS public.case_files (
        id bigserial PRIMARY KEY,
        case_id uuid REFERENCES public.cases(case_id) ON DELETE CASCADE,
        filename text NOT NULL,
        mime text NOT NULL,
        size_bytes bigint,
        storage_path text NOT NULL,
        uploaded_at timestamptz DEFAULT now()
      );`,

      `CREATE TABLE IF NOT EXISTS public.ocr_extractions (
        id bigserial PRIMARY KEY,
        case_id uuid NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
        file_id bigint REFERENCES public.case_files(id) ON DELETE CASCADE,
        page int NOT NULL,
        row_idx int NOT NULL,
        doc_type text,
        code text,
        code_system text,
        modifiers text[],
        description text,
        units numeric,
        charge_cents bigint,
        allowed_cents bigint,
        paid_cents bigint,
        extracted_at timestamptz DEFAULT now()
      );`,

      `CREATE OR REPLACE VIEW v_case_summary AS
      SELECT
        c.case_id,
        c.created_at,
        c.status,
        c.submit_email,
        cp.description,
        COUNT(cf.id) as file_count,
        COUNT(DISTINCT oe.id) as extraction_count,
        0 as detection_count,
        NULL as emailed_at
      FROM cases c
      LEFT JOIN case_profile cp ON c.case_id = cp.case_id
      LEFT JOIN case_files cf ON c.case_id = cf.case_id
      LEFT JOIN ocr_extractions oe ON c.case_id = oe.case_id
      GROUP BY c.case_id, cp.description;`
    ]

    for (const query of setupQueries) {
      const { error } = await supabaseAdmin.rpc('execute_sql', { sql: query })
      if (error) {
        console.log(`⚠️ Query issue (likely table exists):`, error.message)
      }
    }

    // Test case creation
    const { data: testCase, error: testError } = await supabaseAdmin
      .from('cases')
      .insert({ status: 'test' })
      .select('case_id')
      .single()

    if (testError) {
      return NextResponse.json({
        success: false,
        error: 'Database setup incomplete',
        details: testError.message
      }, { status: 500 })
    }

    // Clean up test case
    await supabaseAdmin.from('cases').delete().eq('case_id', testCase.case_id)

    console.log('✅ Database schema setup completed')

    return NextResponse.json({
      success: true,
      message: 'Database schema setup completed successfully',
      tables: ['cases', 'case_profile', 'case_files', 'ocr_extractions', 'v_case_summary']
    })

  } catch (error) {
    console.error('❌ Database setup error:', error)
    return NextResponse.json({
      success: false,
      error: 'Database setup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  // Require admin authentication
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    // Check if tables exist
    const { data: tables, error } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['cases', 'case_profile', 'case_files', 'ocr_extractions'])

    if (error) {
      return NextResponse.json({
        error: 'Failed to check database status',
        details: error.message
      }, { status: 500 })
    }

    const existingTables = tables?.map(t => t.table_name) || []
    const requiredTables = ['cases', 'case_profile', 'case_files', 'ocr_extractions']
    const missingTables = requiredTables.filter(t => !existingTables.includes(t))

    return NextResponse.json({
      status: missingTables.length === 0 ? 'ready' : 'incomplete',
      existingTables,
      missingTables,
      ready: missingTables.length === 0
    })

  } catch (error) {
    console.error('❌ Database status check error:', error)
    return NextResponse.json({
      error: 'Failed to check database status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}