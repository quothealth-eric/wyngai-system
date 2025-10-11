import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  console.log('🎯 MINIMAL UPLOAD API - Testing deployment')

  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }

    // Generate simple case ID
    const caseId = Math.random().toString(36).substring(2, 15)
    console.log(`🆔 Generated case ID: ${caseId}`)

    // Simple response
    const response = {
      caseId,
      status: 'received',
      message: `Received ${files.length} files for processing`,
      totalFiles: files.length
    }

    console.log(`✅ Upload received - Case ID: ${caseId}, Files: ${files.length}`)
    return NextResponse.json(response)

  } catch (error) {
    console.error('❌ Upload API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}