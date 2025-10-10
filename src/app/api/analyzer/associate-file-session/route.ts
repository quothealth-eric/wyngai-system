import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { fileId, sessionId } = await request.json()

    if (!fileId || !sessionId) {
      return NextResponse.json(
        { error: 'File ID and session ID are required' },
        { status: 400 }
      )
    }

    // Update the file to associate it with the session
    const { error } = await supabase
      .from('files')
      .update({ session_id: sessionId })
      .eq('id', fileId)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to associate file with session', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'File associated with session successfully'
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to associate file with session', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}