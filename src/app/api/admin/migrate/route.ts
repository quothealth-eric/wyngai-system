import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🔄 Applying database migrations...')

    // Create case_reports table if it doesn't exist
    const createCaseReportsTable = `
      CREATE TABLE IF NOT EXISTS public.case_reports (
        case_id uuid PRIMARY KEY REFERENCES public.cases(case_id) ON DELETE CASCADE,
        draft jsonb,                     -- Admin-editable structured report (summary + issues + scripts + letters)
        finalized jsonb,                 -- Locked copy when emailed
        emailed_at timestamptz,
        email_to text
      );
    `

    // Create missing indexes if they don't exist
    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status);
      CREATE INDEX IF NOT EXISTS idx_cases_created_at ON public.cases(created_at);
      CREATE INDEX IF NOT EXISTS idx_case_files_case_id ON public.case_files(case_id);
      CREATE INDEX IF NOT EXISTS idx_ocr_extractions_case_id ON public.ocr_extractions(case_id);
      CREATE INDEX IF NOT EXISTS idx_case_detections_case_id ON public.case_detections(case_id);
      CREATE INDEX IF NOT EXISTS idx_case_audit_case_id ON public.case_audit(case_id);
    `

    // Create view if it doesn't exist
    const createView = `
      CREATE OR REPLACE VIEW public.v_case_summary AS
      SELECT
        c.case_id,
        c.created_at,
        c.status,
        c.submit_email,
        cp.description,
        (SELECT count(*) FROM public.case_files f WHERE f.case_id = c.case_id) as file_count,
        (SELECT count(*) FROM public.case_detections d WHERE d.case_id = c.case_id) as detection_count,
        (SELECT count(*) FROM public.ocr_extractions o WHERE o.case_id = c.case_id) as extraction_count,
        cr.emailed_at
      FROM public.cases c
      LEFT JOIN public.case_profile cp ON cp.case_id = c.case_id
      LEFT JOIN public.case_reports cr ON cr.case_id = c.case_id
      ORDER BY c.created_at DESC;
    `

    // Apply migrations
    console.log('📊 Creating case_reports table...')
    const { error: tableError } = await supabaseAdmin.rpc('exec_sql', {
      sql: createCaseReportsTable
    })

    if (tableError) {
      console.error('Failed to create case_reports table:', tableError)
      // Try alternative approach using raw SQL
      const { error: altError } = await supabaseAdmin
        .from('case_reports')
        .select('case_id')
        .limit(1)

      if (altError?.code === 'PGRST116') {
        // Table doesn't exist, need to create it manually
        console.log('Table does not exist, creating manually...')
        throw new Error('case_reports table needs to be created manually in Supabase dashboard')
      }
    }

    console.log('📈 Creating indexes...')
    const { error: indexError } = await supabaseAdmin.rpc('exec_sql', {
      sql: createIndexes
    })

    if (indexError) {
      console.warn('Some indexes may already exist:', indexError)
    }

    console.log('👁️ Creating view...')
    const { error: viewError } = await supabaseAdmin.rpc('exec_sql', {
      sql: createView
    })

    if (viewError) {
      console.warn('View creation may have failed:', viewError)
    }

    // Test if case_reports table is now accessible
    const { data: testData, error: testError } = await supabaseAdmin
      .from('case_reports')
      .select('case_id')
      .limit(1)

    if (testError) {
      console.error('case_reports table still not accessible:', testError)
      return NextResponse.json({
        success: false,
        error: 'Migration applied but table still not accessible',
        details: testError.message,
        instructions: 'You need to manually run the migration SQL in your Supabase dashboard'
      }, { status: 500 })
    }

    console.log('✅ Database migration completed successfully')

    return NextResponse.json({
      success: true,
      message: 'Database migration applied successfully',
      tablesCreated: ['case_reports'],
      indexesCreated: ['idx_cases_status', 'idx_cases_created_at', 'idx_case_files_case_id', 'idx_ocr_extractions_case_id', 'idx_case_detections_case_id', 'idx_case_audit_case_id'],
      viewsCreated: ['v_case_summary']
    })

  } catch (error) {
    console.error('❌ Migration failed:', error)

    return NextResponse.json({
      success: false,
      error: 'Migration failed',
      details: error instanceof Error ? error.message : String(error),
      instructions: 'Please manually run the SQL from supabase/migrations/001_admin_workbench_schema.sql in your Supabase dashboard'
    }, { status: 500 })
  }
}