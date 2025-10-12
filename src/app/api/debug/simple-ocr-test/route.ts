import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { SimpleOCRService } from '@/lib/simple-ocr-service'

export async function GET() {
  try {
    console.log('🔍 Simple OCR Test - Getting recent file for testing...')

    // Get the most recent file from the database
    const { data: recentFile, error: fileError } = await supabaseAdmin
      .from('files')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (fileError || !recentFile) {
      return NextResponse.json({
        success: false,
        message: 'No files found in database for testing',
        error: fileError?.message
      }, { status: 404 })
    }

    console.log(`📄 Testing with recent file: ${recentFile.file_name} (ID: ${recentFile.id})`)

    // Test the simple OCR service
    const ocrService = new SimpleOCRService()
    const result = await ocrService.processDocument(recentFile.id)

    return NextResponse.json({
      success: true,
      message: 'Simple OCR test completed',
      file_info: {
        id: recentFile.id,
        name: recentFile.file_name,
        type: recentFile.file_type,
        size: recentFile.file_size
      },
      ocr_result: result,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Simple OCR test failed:', error)

    return NextResponse.json({
      success: false,
      message: 'Simple OCR test failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('📋 Simple OCR Test - Testing with uploaded file...')

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({
        success: false,
        message: 'No file provided for testing'
      }, { status: 400 })
    }

    console.log(`📄 Testing with uploaded file: ${file.name} (${file.type}, ${file.size} bytes)`)

    // Create a temporary case and file record for testing
    const { data: testCase, error: caseError } = await supabaseAdmin
      .from('cases')
      .insert({
        user_question: 'Simple OCR test case',
        llm_response: { test: true },
        session_id: 'simple-ocr-test-' + Date.now()
      })
      .select()
      .single()

    if (caseError) {
      return NextResponse.json({
        success: false,
        message: 'Failed to create test case',
        error: caseError.message
      }, { status: 500 })
    }

    // Upload file to storage
    const fileBuffer = await file.arrayBuffer()
    const fileName = `test-${Date.now()}-${file.name}`

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('uploads')
      .upload(fileName, fileBuffer, {
        contentType: file.type
      })

    if (uploadError) {
      return NextResponse.json({
        success: false,
        message: 'Failed to upload test file',
        error: uploadError.message
      }, { status: 500 })
    }

    // Create file record
    const { data: fileRecord, error: fileRecordError } = await supabaseAdmin
      .from('files')
      .insert({
        case_id: testCase.id,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: uploadData.path
      })
      .select()
      .single()

    if (fileRecordError) {
      return NextResponse.json({
        success: false,
        message: 'Failed to create file record',
        error: fileRecordError.message
      }, { status: 500 })
    }

    // Test the simple OCR service
    const ocrService = new SimpleOCRService()
    const result = await ocrService.processDocument(fileRecord.id)

    // Clean up test data
    await supabaseAdmin.storage.from('uploads').remove([uploadData.path])
    await supabaseAdmin.from('files').delete().eq('id', fileRecord.id)
    await supabaseAdmin.from('cases').delete().eq('id', testCase.id)

    return NextResponse.json({
      success: true,
      message: 'Simple OCR test with uploaded file completed',
      file_info: {
        name: file.name,
        type: file.type,
        size: file.size
      },
      ocr_result: result,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Simple OCR upload test failed:', error)

    return NextResponse.json({
      success: false,
      message: 'Simple OCR upload test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}