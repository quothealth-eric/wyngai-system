import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('🔍 OCR Debug: Checking environment configuration...')

    const accessToken = process.env.GOOGLE_CLOUD_ACCESS_TOKEN
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID
    const openaiKey = process.env.OPENAI_API_KEY
    const anthropicKey = process.env.ANTHROPIC_API_KEY

    return NextResponse.json({
      status: 'debug',
      environment: {
        hasGoogleToken: !!accessToken,
        googleTokenLength: accessToken?.length || 0,
        googleTokenPreview: accessToken ? `${accessToken.substring(0, 20)}...` : 'Not set',
        hasProjectId: !!projectId,
        projectId: projectId || 'Not set',
        hasOpenAI: !!openaiKey,
        openaiKeyLength: openaiKey?.length || 0,
        hasAnthropic: !!anthropicKey,
        anthropicKeyLength: anthropicKey?.length || 0
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ OCR Debug error:', error)

    return NextResponse.json({
      status: 'error',
      message: 'OCR debug failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 OCR Debug: Testing Google Cloud Vision with sample image...')

    const accessToken = process.env.GOOGLE_CLOUD_ACCESS_TOKEN
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID

    if (!accessToken || !projectId) {
      return NextResponse.json({
        status: 'error',
        message: 'Google Cloud credentials not configured',
        hasToken: !!accessToken,
        hasProject: !!projectId
      }, { status: 400 })
    }

    // Simple test image with text (base64 encoded white image with text)
    const testImageBase64 = `/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/AB8AAQAB/9k=`

    console.log(`🌐 Testing Google Cloud Vision API for project: ${projectId}`)

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          image: {
            content: testImageBase64
          },
          features: [{
            type: 'TEXT_DETECTION',
            maxResults: 10
          }]
        }]
      })
    })

    const responseBody = await response.text()
    let parsedResponse = null

    try {
      parsedResponse = JSON.parse(responseBody)
    } catch {
      // Response is not JSON
    }

    if (!response.ok) {
      console.error(`❌ Google Cloud Vision API test failed: ${response.status}`)

      return NextResponse.json({
        status: 'error',
        message: `Google Cloud Vision API test failed: ${response.status}`,
        details: responseBody,
        projectId: projectId,
        tokenPreview: `${accessToken.substring(0, 20)}...`,
        url: 'https://vision.googleapis.com/v1/images:annotate',
        timestamp: new Date().toISOString()
      }, { status: response.status })
    }

    console.log(`✅ Google Cloud Vision API test successful`)

    return NextResponse.json({
      status: 'success',
      message: 'Google Cloud Vision API is working correctly',
      response: parsedResponse,
      projectId: projectId,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Google Cloud Vision test error:', error)

    return NextResponse.json({
      status: 'error',
      message: 'Google Cloud Vision test failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}