import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Testing Google Cloud Vision raw text extraction...')

    const accessToken = process.env.GOOGLE_CLOUD_ACCESS_TOKEN
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID

    if (!accessToken || !projectId) {
      return NextResponse.json({
        status: 'error',
        message: 'Google Cloud credentials not configured'
      }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({
        status: 'error',
        message: 'No file provided'
      }, { status: 400 })
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64Image = buffer.toString('base64')

    console.log(`🌐 Testing Google Cloud Vision with file: ${file.name} (${buffer.length} bytes)`)

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': projectId,
      },
      body: JSON.stringify({
        requests: [{
          image: {
            content: base64Image
          },
          features: [{
            type: 'TEXT_DETECTION',
            maxResults: 50
          }]
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({
        status: 'error',
        message: `Google Cloud Vision API error: ${response.status}`,
        details: errorText
      }, { status: response.status })
    }

    const result = await response.json()

    // Extract full text
    const fullText = result.responses?.[0]?.textAnnotations?.[0]?.description || ''
    const textLength = fullText.length

    // Get all text annotations for detailed analysis
    const allAnnotations = result.responses?.[0]?.textAnnotations || []

    return NextResponse.json({
      status: 'success',
      message: `Google Cloud Vision extracted ${textLength} characters`,
      fileName: file.name,
      fileSize: buffer.length,
      textLength: textLength,
      fullText: fullText,
      annotationsCount: allAnnotations.length,
      textPreview: fullText.substring(0, 1000),
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Google Cloud Vision raw test error:', error)

    return NextResponse.json({
      status: 'error',
      message: 'Google Cloud Vision raw test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}