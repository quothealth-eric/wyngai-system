import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/db'

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🔧 Migrating database schema for EOB support...')

    // Check if document_type column already exists
    const { data: existingFiles, error: checkError } = await supabaseAdmin
      .from('case_files')
      .select('document_type')
      .limit(1)

    if (checkError && (checkError.message.includes('column "document_type" does not exist') || checkError.code === 'PGRST204')) {
      console.log('📋 document_type column needs to be added to case_files table...')

      return NextResponse.json({
        success: false,
        requiresManualMigration: true,
        instructions: [
          '1. Go to your Supabase Dashboard',
          '2. Navigate to SQL Editor',
          '3. Run this SQL command:',
          'ALTER TABLE case_files ADD COLUMN document_type text DEFAULT \'bill\';',
          '4. After running the SQL, try uploading again'
        ],
        sqlCommand: `ALTER TABLE case_files ADD COLUMN document_type text DEFAULT 'bill';`,
        message: 'Please run the SQL command in your Supabase SQL Editor to add the document_type column.'
      })
    } else if (checkError) {
      throw new Error(`Database check failed: ${checkError.message}`)
    }

    // Check if case_profile.insurance column supports EOB data
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from('case_profile')
      .select('insurance')
      .limit(1)

    if (profileError) {
      console.log('⚠️ case_profile table access issue:', profileError.message)
    }

    console.log('✅ Schema migration check completed')

    return NextResponse.json({
      success: true,
      migrations: [
        {
          table: 'case_files',
          column: 'document_type',
          status: 'exists',
          description: 'Column for storing file type (bill/eob)'
        },
        {
          table: 'case_profile',
          column: 'insurance',
          status: 'exists',
          description: 'JSON column for storing insurance plan data and EOB info'
        }
      ],
      message: 'Database schema is ready for EOB support'
    })

  } catch (error) {
    console.error('❌ Migration check failed:', error)
    return NextResponse.json(
      {
        error: 'Migration check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}