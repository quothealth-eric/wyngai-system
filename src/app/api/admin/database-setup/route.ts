import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  // Require admin authentication
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🔧 Setting up database schema...')

    // Since we can't execute raw SQL in Supabase directly, we'll test table creation by inserting
    // This will help identify if tables need to be created manually in Supabase UI

    let createdTables = []
    let errors = []

    // Test cases table
    try {
      const { data: testCase, error: caseError } = await supabaseAdmin
        .from('cases')
        .insert({ status: 'test' })
        .select('case_id')
        .single()

      if (caseError) {
        errors.push(`cases: ${caseError.message}`)
      } else {
        createdTables.push('cases')
        // Clean up test case
        await supabaseAdmin.from('cases').delete().eq('case_id', testCase.case_id)
      }
    } catch (err) {
      errors.push(`cases: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }

    // Test case_profile table
    try {
      const { error: profileError } = await supabaseAdmin
        .from('case_profile')
        .select('*')
        .limit(1)

      if (profileError) {
        errors.push(`case_profile: ${profileError.message}`)
      } else {
        createdTables.push('case_profile')
      }
    } catch (err) {
      errors.push(`case_profile: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }

    // Test case_files table
    try {
      const { error: filesError } = await supabaseAdmin
        .from('case_files')
        .select('*')
        .limit(1)

      if (filesError) {
        errors.push(`case_files: ${filesError.message}`)
      } else {
        createdTables.push('case_files')
      }
    } catch (err) {
      errors.push(`case_files: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }

    console.log('✅ Database schema check completed')

    return NextResponse.json({
      success: true,
      message: 'Database schema check completed',
      existingTables: createdTables,
      errors: errors,
      instruction: errors.length > 0 ? 'Some tables need to be created manually in Supabase. Check the admin panel for SQL scripts.' : 'All tables exist'
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
    // Check if tables exist by trying to query them
    const requiredTables = ['cases', 'case_profile', 'case_files', 'ocr_extractions']
    const existingTables = []
    const missingTables = []

    for (const tableName of requiredTables) {
      try {
        const { error } = await supabaseAdmin
          .from(tableName)
          .select('*')
          .limit(1)

        if (error) {
          missingTables.push(tableName)
        } else {
          existingTables.push(tableName)
        }
      } catch (err) {
        missingTables.push(tableName)
      }
    }

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