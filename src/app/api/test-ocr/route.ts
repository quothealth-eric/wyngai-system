import { NextRequest, NextResponse } from 'next/server'
import { OCRService } from '@/lib/ocr-service'

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 TEST OCR API - Starting OCR test')

    const body = await request.json()
    const { fileId, sessionId } = body

    if (!fileId || !sessionId) {
      return NextResponse.json(
        { error: 'fileId and sessionId are required' },
        { status: 400 }
      )
    }

    console.log(`🧪 Testing OCR for file: ${fileId}, session: ${sessionId}`)

    // Test the OCR service directly
    const ocrService = new OCRService()
    const result = await ocrService.processDocument(fileId, sessionId)

    console.log(`🧪 OCR test completed:`, result)

    return NextResponse.json({
      success: true,
      testResult: result,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ OCR test failed:', error)
    return NextResponse.json(
      {
        error: 'OCR test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : null
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'OCR Test endpoint ready',
    usage: 'POST with { fileId, sessionId } to test OCR processing'
  })
}