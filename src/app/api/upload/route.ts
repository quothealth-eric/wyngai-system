import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import * as crypto from 'crypto'

export async function POST(request: NextRequest) {
  console.log('🎯 BASIC UPLOAD API - Testing with Supabase')

  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }

    // Generate case ID using crypto
    const caseId = crypto.randomUUID()
    console.log(`🆔 Generated case ID: ${caseId}`)

    // Test database connection by creating case
    const { error: caseError } = await supabase
      .from('cases')
      .insert({
        case_id: caseId,
        status: 'uploading'
      })

    if (caseError) {
      console.error('❌ Failed to create case:', caseError)
      return NextResponse.json(
        { error: 'Failed to create upload case', details: caseError.message },
        { status: 500 }
      )
    }

    // Basic response with database connectivity confirmed
    const response = {
      caseId,
      status: 'received',
      message: `Received ${files.length} files, case created in database`,
      totalFiles: files.length
    }

    console.log(`✅ Upload received with DB - Case ID: ${caseId}, Files: ${files.length}`)
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