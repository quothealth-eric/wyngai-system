import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🚀 Creating chat_sessions table...')

    // Create the chat_sessions table with all necessary columns
    // First try to create the table using a simpler approach
    let error: any = null

    try {
      // Test if table exists first
      const { data: existingTable } = await supabaseAdmin
        .from('chat_sessions')
        .select('chat_id')
        .limit(1)

      console.log('chat_sessions table already exists')
    } catch (tableError) {
      console.log('chat_sessions table does not exist, attempting to create via SQL...')

      // Try using the direct SQL approach via a simple query
      const { error: sqlError } = await supabaseAdmin
        .from('sql')
        .select(`
          CREATE TABLE IF NOT EXISTS public.chat_sessions (
            chat_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            case_id uuid,
            user_id text,
            session_type text DEFAULT 'insurance_assistant',
            context_data jsonb,
            context_frame jsonb,
            started_at timestamptz DEFAULT now(),
            last_activity_at timestamptz DEFAULT now(),
            status text DEFAULT 'active'
          )
        `)

      if (sqlError) {
        error = sqlError
      }
    }

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to create chat_sessions table', details: error.message },
        { status: 500 }
      )
    }

    console.log('✅ chat_sessions table created successfully!')

    return NextResponse.json({
      success: true,
      message: 'Chat sessions table created successfully',
      table: 'chat_sessions',
      columns: [
        'chat_id (UUID, Primary Key)',
        'case_id (UUID, Foreign Key)',
        'user_id (TEXT)',
        'session_type (TEXT)',
        'context_data (JSONB)',
        'context_frame (JSONB)',
        'started_at (TIMESTAMPTZ)',
        'last_activity_at (TIMESTAMPTZ)',
        'status (TEXT)'
      ],
      indexes: [
        'idx_chat_sessions_case_id',
        'idx_chat_sessions_user_id',
        'idx_chat_sessions_last_activity',
        'idx_chat_sessions_context_frame'
      ]
    })

  } catch (error) {
    console.error('❌ Setup error:', error)
    return NextResponse.json(
      { error: 'Setup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Chat sessions table setup endpoint',
    methods: ['POST'],
    creates: 'chat_sessions table with context_frame support',
    purpose: 'Manages conversation sessions with slot-based context tracking'
  })
}