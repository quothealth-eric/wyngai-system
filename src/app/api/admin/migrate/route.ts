import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🔧 Starting comprehensive database migration...')

    const migrationResults: string[] = []

    // 1. Ensure case_reports table exists with ALL required columns that the code expects
    console.log('📋 Checking case_reports table...')

    const createCaseReportsQuery = `
      CREATE TABLE IF NOT EXISTS public.case_reports (
        case_id UUID PRIMARY KEY,
        draft JSONB,
        report_path TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `

    const { error: createCaseReportsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: createCaseReportsQuery
    })

    if (createCaseReportsError) {
      console.error('Failed to create case_reports table:', createCaseReportsError)
      migrationResults.push(`❌ case_reports: ${createCaseReportsError.message}`)
    } else {
      console.log('✅ case_reports table ready')
      migrationResults.push('✅ case_reports: table ready')
    }

    // Add missing columns to case_reports if they don't exist
    const addCaseReportsColumnsQueries = [
      'ALTER TABLE public.case_reports ADD COLUMN IF NOT EXISTS report_path TEXT;',
      'ALTER TABLE public.case_reports ADD COLUMN IF NOT EXISTS draft JSONB;',
      'ALTER TABLE public.case_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();',
      'ALTER TABLE public.case_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();'
    ]

    for (const query of addCaseReportsColumnsQueries) {
      const { error } = await supabaseAdmin.rpc('exec_sql', { sql: query })
      if (error && !error.message.includes('already exists')) {
        console.error('Failed to add column:', error)
        migrationResults.push(`❌ case_reports column: ${error.message}`)
      }
    }

    // 2. Ensure case_detections table has required columns
    console.log('📋 Checking case_detections table...')

    const createCaseDetectionsQuery = `
      CREATE TABLE IF NOT EXISTS public.case_detections (
        id SERIAL PRIMARY KEY,
        case_id UUID NOT NULL,
        rule_key TEXT NOT NULL,
        severity TEXT NOT NULL,
        explanation TEXT,
        evidence TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `

    const { error: createDetectionsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: createCaseDetectionsQuery
    })

    if (createDetectionsError) {
      console.error('Failed to create case_detections table:', createDetectionsError)
      migrationResults.push(`❌ case_detections: ${createDetectionsError.message}`)
    } else {
      console.log('✅ case_detections table ready')
      migrationResults.push('✅ case_detections: table ready')
    }

    // Add missing columns to case_detections if they don't exist
    const addDetectionsColumnsQueries = [
      'ALTER TABLE public.case_detections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();',
      'ALTER TABLE public.case_detections ADD COLUMN IF NOT EXISTS evidence TEXT;'
    ]

    for (const query of addDetectionsColumnsQueries) {
      const { error } = await supabaseAdmin.rpc('exec_sql', { sql: query })
      if (error && !error.message.includes('already exists')) {
        console.error('Failed to add detection column:', error)
        migrationResults.push(`❌ case_detections column: ${error.message}`)
      }
    }

    // 3. Ensure ocr_extractions table has ALL required columns for detailed billing data
    console.log('📋 Checking ocr_extractions table...')

    const createOcrExtractionsQuery = `
      CREATE TABLE IF NOT EXISTS public.ocr_extractions (
        id SERIAL PRIMARY KEY,
        case_id UUID NOT NULL,
        artifact_id UUID,
        artifact_digest TEXT,
        page INTEGER,
        row_idx INTEGER,
        doc_type TEXT,
        code TEXT,
        code_system TEXT,
        description TEXT,
        charge_cents INTEGER,
        allowed_cents INTEGER,
        plan_paid_cents INTEGER,
        patient_resp_cents INTEGER,
        dos DATE,
        validators JSONB,
        low_conf BOOLEAN,
        vendor_consensus FLOAT,
        conf FLOAT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `

    const { error: createOcrError } = await supabaseAdmin.rpc('exec_sql', {
      sql: createOcrExtractionsQuery
    })

    if (createOcrError) {
      console.error('Failed to create ocr_extractions table:', createOcrError)
      migrationResults.push(`❌ ocr_extractions: ${createOcrError.message}`)
    } else {
      console.log('✅ ocr_extractions table ready')
      migrationResults.push('✅ ocr_extractions: table ready')
    }

    // Add missing columns to ocr_extractions if they don't exist
    const addOcrColumnsQueries = [
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS case_id UUID;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS artifact_id UUID;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS artifact_digest TEXT;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS page INTEGER;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS row_idx INTEGER;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS doc_type TEXT;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS code TEXT;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS code_system TEXT;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS description TEXT;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS charge_cents INTEGER;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS allowed_cents INTEGER;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS plan_paid_cents INTEGER;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS patient_resp_cents INTEGER;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS dos DATE;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS validators JSONB;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS low_conf BOOLEAN;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS vendor_consensus FLOAT;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS conf FLOAT;',
      'ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();'
    ]

    for (const query of addOcrColumnsQueries) {
      const { error } = await supabaseAdmin.rpc('exec_sql', { sql: query })
      if (error && !error.message.includes('already exists')) {
        console.error('Failed to add OCR column:', error)
        migrationResults.push(`❌ ocr_extractions column: ${error.message}`)
      }
    }

    // 4. Test all tables are accessible with the columns the code expects
    console.log('🧪 Testing table accessibility...')

    // Test case_reports with all expected columns
    const { error: testCaseReportsError } = await supabaseAdmin
      .from('case_reports')
      .select('case_id, draft, report_path, created_at, updated_at')
      .limit(1)

    if (testCaseReportsError) {
      console.error('case_reports table not accessible:', testCaseReportsError)
      migrationResults.push(`❌ case_reports test: ${testCaseReportsError.message}`)
    } else {
      migrationResults.push('✅ case_reports: all columns accessible')
    }

    // Test case_detections with all expected columns
    const { error: testDetectionsError } = await supabaseAdmin
      .from('case_detections')
      .select('case_id, rule_key, severity, explanation, evidence, created_at')
      .limit(1)

    if (testDetectionsError) {
      console.error('case_detections table not accessible:', testDetectionsError)
      migrationResults.push(`❌ case_detections test: ${testDetectionsError.message}`)
    } else {
      migrationResults.push('✅ case_detections: all columns accessible')
    }

    // Test ocr_extractions with all expected columns
    const { error: testOcrError } = await supabaseAdmin
      .from('ocr_extractions')
      .select('case_id, code, description, charge_cents, allowed_cents, plan_paid_cents, patient_resp_cents, dos, page, row_idx, code_system, low_conf, conf')
      .limit(1)

    if (testOcrError) {
      console.error('ocr_extractions table not accessible:', testOcrError)
      migrationResults.push(`❌ ocr_extractions test: ${testOcrError.message}`)
    } else {
      migrationResults.push('✅ ocr_extractions: all columns accessible')
    }

    console.log('🎉 Comprehensive migration completed')
    return NextResponse.json({
      success: true,
      message: 'Comprehensive database migration completed - all columns aligned with code expectations',
      results: migrationResults,
      tablesProcessed: ['case_reports', 'case_detections', 'ocr_extractions'],
      columnsEnsured: {
        case_reports: ['case_id', 'draft', 'report_path', 'created_at', 'updated_at'],
        case_detections: ['case_id', 'rule_key', 'severity', 'explanation', 'evidence', 'created_at'],
        ocr_extractions: ['case_id', 'artifact_id', 'artifact_digest', 'page', 'row_idx', 'doc_type', 'code', 'code_system', 'description', 'charge_cents', 'allowed_cents', 'plan_paid_cents', 'patient_resp_cents', 'dos', 'validators', 'low_conf', 'vendor_consensus', 'conf', 'created_at']
      }
    })

  } catch (error) {
    console.error('❌ Migration failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Migration failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}