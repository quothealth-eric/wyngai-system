import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Create thread_sessions table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS thread_sessions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        thread_id VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_accessed TIMESTAMP WITH TIME ZONE,
        UNIQUE(thread_id, email)
      );

      CREATE INDEX IF NOT EXISTS idx_thread_sessions_thread_id ON thread_sessions(thread_id);
      CREATE INDEX IF NOT EXISTS idx_thread_sessions_token ON thread_sessions(token);
      CREATE INDEX IF NOT EXISTS idx_thread_sessions_email ON thread_sessions(email);
      CREATE INDEX IF NOT EXISTS idx_thread_sessions_expires_at ON thread_sessions(expires_at);
    `

    const { error } = await supabase.rpc('exec_sql', { sql: createTableQuery })

    if (error) {
      console.error('Database setup error:', error)
      return NextResponse.json(
        { error: 'Failed to create thread_sessions table', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Thread sessions table created successfully',
      table: 'thread_sessions',
      columns: [
        'id (UUID, Primary Key)',
        'thread_id (VARCHAR)',
        'email (VARCHAR)',
        'token (VARCHAR, Unique)',
        'expires_at (TIMESTAMP)',
        'created_at (TIMESTAMP)',
        'last_accessed (TIMESTAMP)'
      ],
      indexes: [
        'idx_thread_sessions_thread_id',
        'idx_thread_sessions_token',
        'idx_thread_sessions_email',
        'idx_thread_sessions_expires_at'
      ]
    })

  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json(
      {
        error: 'Database setup failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Thread sessions table setup endpoint',
    methods: ['POST'],
    creates: 'thread_sessions table with indexes',
    purpose: 'Manages magic link sessions for thread persistence'
  })
}