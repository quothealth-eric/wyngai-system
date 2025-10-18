import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/db'

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🔧 Adding document_type column to case_files table...')

    // Test if the column already exists by trying to select it
    const { data: testData, error: testError } = await supabaseAdmin
      .from('case_files')
      .select('document_type')
      .limit(1)

    if (!testError) {
      return NextResponse.json({
        success: true,
        message: 'document_type column already exists',
        alreadyExists: true
      })
    }

    // If we get a PGRST204 error, the column doesn't exist
    if (testError.code === 'PGRST204' || testError.message.includes('document_type')) {
      console.log('📋 Column does not exist, need to add it manually...')

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
        message: 'The document_type column needs to be added manually through Supabase SQL Editor'
      })
    }

    throw new Error(`Unexpected error: ${testError.message}`)

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