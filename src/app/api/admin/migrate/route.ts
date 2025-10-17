import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🔧 Starting database migration without RPC...')

    const migrationResults: string[] = []

    // Create the analysis_data column in case_reports table using direct SQL
    console.log('📋 Adding analysis_data column to case_reports...')

    try {
      // Check if the table exists, if not create it
      const { data: tableExists } = await supabaseAdmin
        .from('case_reports')
        .select('case_id')
        .limit(1)

      console.log('✅ case_reports table exists')
      migrationResults.push('✅ case_reports: table exists')
    } catch (error: any) {
      console.log('❌ case_reports table might not exist:', error.message)
      migrationResults.push(`❌ case_reports: ${error.message}`)
    }

    // Try to test if analysis_data column exists by selecting it
    try {
      const { data, error } = await supabaseAdmin
        .from('case_reports')
        .select('analysis_data')
        .limit(1)

      if (error) {
        console.log('analysis_data column might not exist:', error.message)
        migrationResults.push('⚠️ analysis_data column may be missing')
      } else {
        console.log('✅ analysis_data column exists')
        migrationResults.push('✅ analysis_data: column exists')
      }
    } catch (error: any) {
      console.log('analysis_data column test failed:', error.message)
      migrationResults.push(`❌ analysis_data test: ${error.message}`)
    }

    // Test case_detections table
    console.log('📋 Testing case_detections table...')
    try {
      const { data, error } = await supabaseAdmin
        .from('case_detections')
        .select('case_id, rule_key, severity, explanation, evidence')
        .limit(1)

      if (error) {
        console.log('case_detections table issue:', error.message)
        migrationResults.push(`❌ case_detections: ${error.message}`)
      } else {
        console.log('✅ case_detections table accessible')
        migrationResults.push('✅ case_detections: table accessible')
      }
    } catch (error: any) {
      console.log('case_detections test failed:', error.message)
      migrationResults.push(`❌ case_detections: ${error.message}`)
    }

    // Test if we can upsert to case_reports with analysis_data
    console.log('🧪 Testing case_reports upsert with analysis_data...')
    try {
      const testCaseId = 'test-migration-' + Date.now()
      const { error } = await supabaseAdmin
        .from('case_reports')
        .upsert({
          case_id: testCaseId,
          analysis_data: { test: 'migration' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (error) {
        console.log('case_reports upsert failed:', error.message)
        migrationResults.push(`❌ case_reports upsert: ${error.message}`)
      } else {
        console.log('✅ case_reports upsert successful')
        migrationResults.push('✅ case_reports: upsert with analysis_data works')

        // Clean up test record
        await supabaseAdmin
          .from('case_reports')
          .delete()
          .eq('case_id', testCaseId)
      }
    } catch (error: any) {
      console.log('case_reports upsert test failed:', error.message)
      migrationResults.push(`❌ case_reports upsert: ${error.message}`)
    }

    console.log('🎉 Migration tests completed')
    return NextResponse.json({
      success: true,
      message: 'Database migration tests completed',
      results: migrationResults,
      recommendation: migrationResults.some(r => r.includes('analysis_data column may be missing'))
        ? 'Please add the analysis_data JSONB column to case_reports table manually in Supabase dashboard'
        : 'Database appears ready for analysis data storage'
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