import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fileId = searchParams.get('fileId')

  if (!fileId) {
    return NextResponse.json(
      { error: 'File ID is required' },
      { status: 400 }
    )
  }

  try {
    const { data: file, error } = await supabase
      .from('files')
      .select('session_id')
      .eq('id', fileId)
      .single()

    if (error || !file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      sessionId: file.session_id
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get file session', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}