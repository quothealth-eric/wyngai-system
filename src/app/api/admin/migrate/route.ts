import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🔧 Starting comprehensive database migration...')

    const migrationResults: string[] = []

    // 1. Add all missing columns to ocr_extractions table using direct PostgreSQL commands
    console.log('📋 Adding missing columns to ocr_extractions table...')

    const columnsToAdd = [
      { name: 'case_id', type: 'UUID' },
      { name: 'artifact_id', type: 'UUID' },
      { name: 'artifact_digest', type: 'TEXT' },
      { name: 'page', type: 'INTEGER' },
      { name: 'row_idx', type: 'INTEGER' },
      { name: 'doc_type', type: 'TEXT' },
      { name: 'code', type: 'TEXT' },
      { name: 'code_system', type: 'TEXT' },
      { name: 'description', type: 'TEXT' },
      { name: 'charge_cents', type: 'INTEGER' },
      { name: 'allowed_cents', type: 'INTEGER' },
      { name: 'plan_paid_cents', type: 'INTEGER' },
      { name: 'patient_resp_cents', type: 'INTEGER' },
      { name: 'dos', type: 'DATE' },
      { name: 'validators', type: 'JSONB' },
      { name: 'low_conf', type: 'BOOLEAN' },
      { name: 'vendor_consensus', type: 'FLOAT' },
      { name: 'conf', type: 'FLOAT' },
      { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' }
    ]

    // Try to add each column individually, using SQL queries
    for (const column of columnsToAdd) {
      try {
        // Use a raw SQL query to add the column if it doesn't exist
        const { error } = await supabaseAdmin
          .rpc('sql', {
            query: `ALTER TABLE public.ocr_extractions ADD COLUMN IF NOT EXISTS ${column.name} ${column.type};`
          })

        if (error) {
          console.log(`Column ${column.name} might already exist or couldn't be added:`, error.message)
          migrationResults.push(`⚠️ ${column.name}: ${error.message}`)
        } else {
          console.log(`✅ Added column: ${column.name}`)
          migrationResults.push(`✅ ${column.name}: added successfully`)
        }
      } catch (err: any) {
        console.log(`Column ${column.name} operation failed:`, err.message)
        migrationResults.push(`❌ ${column.name}: ${err.message}`)
      }
    }

    // 2. Add missing columns to case_reports table
    console.log('📋 Adding missing columns to case_reports table...')

    const caseReportsColumns = [
      { name: 'case_id', type: 'UUID PRIMARY KEY' },
      { name: 'draft', type: 'JSONB' },
      { name: 'report_path', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()' }
    ]

    for (const column of caseReportsColumns) {
      try {
        const { error } = await supabaseAdmin
          .rpc('sql', {
            query: `ALTER TABLE public.case_reports ADD COLUMN IF NOT EXISTS ${column.name} ${column.type};`
          })

        if (error) {
          console.log(`Case reports column ${column.name} might already exist:`, error.message)
          migrationResults.push(`⚠️ case_reports.${column.name}: ${error.message}`)
        } else {
          console.log(`✅ Added case_reports column: ${column.name}`)
          migrationResults.push(`✅ case_reports.${column.name}: added successfully`)
        }
      } catch (err: any) {
        console.log(`Case reports column ${column.name} operation failed:`, err.message)
        migrationResults.push(`❌ case_reports.${column.name}: ${err.message}`)
      }
    }

    // 3. Add missing columns to case_detections table
    console.log('📋 Adding missing columns to case_detections table...')

    const caseDetectionsColumns = [
      { name: 'id', type: 'SERIAL PRIMARY KEY' },
      { name: 'case_id', type: 'UUID NOT NULL' },
      { name: 'rule_key', type: 'TEXT NOT NULL' },
      { name: 'severity', type: 'TEXT NOT NULL' },
      { name: 'explanation', type: 'TEXT' },
      { name: 'evidence', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' }
    ]

    for (const column of caseDetectionsColumns) {
      try {
        const { error } = await supabaseAdmin
          .rpc('sql', {
            query: `ALTER TABLE public.case_detections ADD COLUMN IF NOT EXISTS ${column.name} ${column.type};`
          })

        if (error) {
          console.log(`Case detections column ${column.name} might already exist:`, error.message)
          migrationResults.push(`⚠️ case_detections.${column.name}: ${error.message}`)
        } else {
          console.log(`✅ Added case_detections column: ${column.name}`)
          migrationResults.push(`✅ case_detections.${column.name}: added successfully`)
        }
      } catch (err: any) {
        console.log(`Case detections column ${column.name} operation failed:`, err.message)
        migrationResults.push(`❌ case_detections.${column.name}: ${err.message}`)
      }
    }

    // 4. Test ocr_extractions table access with key columns
    console.log('🧪 Testing ocr_extractions table access...')
    try {
      const { error: testOcrError } = await supabaseAdmin
        .from('ocr_extractions')
        .select('case_id, conf, low_conf, code, charge_cents')
        .limit(1)

      if (testOcrError) {
        console.error('OCR extractions test failed:', testOcrError)
        migrationResults.push(`❌ ocr_extractions test: ${testOcrError.message}`)
      } else {
        migrationResults.push('✅ ocr_extractions: key columns accessible')
      }
    } catch (err: any) {
      migrationResults.push(`❌ ocr_extractions test failed: ${err.message}`)
    }

    console.log('🎉 Migration completed')
    return NextResponse.json({
      success: true,
      message: 'Database migration completed - attempted to add all required columns',
      results: migrationResults,
      tablesProcessed: ['ocr_extractions', 'case_reports', 'case_detections'],
      note: 'Some operations may show warnings if columns already exist - this is normal'
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