import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  // Require admin authentication
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log(`📥 Admin: Downloading file ${params.fileId}`)

    // Get file metadata
    const { data: fileData, error: fileError } = await supabaseAdmin
      .from('case_files')
      .select('*')
      .eq('id', params.fileId)
      .single()

    if (fileError || !fileData) {
      console.error('❌ File not found:', fileError)
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    // Download file from storage
    const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
      .from('wyng_cases')
      .download(fileData.storage_path)

    if (downloadError) {
      console.error('❌ Failed to download file:', downloadError)
      return NextResponse.json(
        { error: 'Failed to download file', details: downloadError.message },
        { status: 500 }
      )
    }

    console.log(`✅ Admin: File downloaded successfully - ${fileData.filename}`)

    // Convert blob to array buffer for response
    const buffer = await fileBlob.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': fileData.mime,
        'Content-Disposition': `attachment; filename="${fileData.filename}"`,
        'Content-Length': fileData.size_bytes.toString(),
        'Cache-Control': 'no-cache'
      }
    })

  } catch (error) {
    console.error('❌ Admin file download API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}