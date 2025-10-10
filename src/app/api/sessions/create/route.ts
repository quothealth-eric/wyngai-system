import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function POST(request: NextRequest) {
  console.log('🆕 Creating new document session...')

  try {
    const { sessionType, description } = await request.json()

    // Validate session type
    const validTypes = ['bill_analysis', 'chat']
    if (!validTypes.includes(sessionType)) {
      return NextResponse.json(
        { error: 'Invalid session type. Must be "bill_analysis" or "chat"' },
        { status: 400 }
      )
    }

    console.log(`📋 Creating ${sessionType} session: ${description || 'No description'}`)

    // Create new document session
    const { data: session, error: sessionError } = await supabase
      .from('document_sessions')
      .insert({
        session_type: sessionType,
        user_description: description || `${sessionType.replace('_', ' ')} session`,
        status: 'uploading',
        total_documents: 0,
        total_charges: 0
      })
      .select()
      .single()

    if (sessionError) {
      console.error('❌ Failed to create session:', sessionError)
      return NextResponse.json(
        { error: 'Failed to create session', details: sessionError.message },
        { status: 500 }
      )
    }

    console.log(`✅ Created session: ${session.id}`)

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        type: session.session_type,
        description: session.user_description,
        status: session.status,
        created_at: session.created_at
      }
    })

  } catch (error) {
    console.error('❌ Session creation failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to create session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Get recent sessions
  try {
    const { data: sessions, error } = await supabase
      .from('document_sessions')
      .select(`
        id,
        session_type,
        user_description,
        status,
        total_documents,
        total_charges,
        created_at,
        files (
          id,
          file_name,
          document_number
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch sessions', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      sessions: sessions || []
    })

  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch sessions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}