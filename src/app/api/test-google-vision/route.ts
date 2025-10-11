import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('🔍 Testing Google Cloud Vision configuration...')

    const accessToken = process.env.GOOGLE_CLOUD_ACCESS_TOKEN
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID

    if (!accessToken) {
      return NextResponse.json({
        status: 'error',
        message: 'GOOGLE_CLOUD_ACCESS_TOKEN environment variable not set',
        hasProjectId: !!projectId,
        timestamp: new Date().toISOString()
      })
    }

    if (!projectId) {
      return NextResponse.json({
        status: 'error',
        message: 'GOOGLE_CLOUD_PROJECT_ID environment variable not set',
        hasAccessToken: !!accessToken,
        timestamp: new Date().toISOString()
      })
    }

    // Test API access with a simple OCR request
    console.log(`🌐 Testing Google Cloud Vision API access for project: ${projectId}`)

    // Simple test with a minimal image
    const testImageBase64 = `/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/AB8AAQAB/9k=`

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?quotaProjectId=${projectId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': projectId,
      },
      body: JSON.stringify({
        requests: [{
          image: {
            content: testImageBase64
          },
          features: [{
            type: 'TEXT_DETECTION',
            maxResults: 5
          }]
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Google Cloud Vision API test failed: ${response.status} - ${errorText}`)

      return NextResponse.json({
        status: 'error',
        message: `Google Cloud Vision API access failed: ${response.status}`,
        details: errorText,
        hasCredentials: true,
        projectId: projectId,
        timestamp: new Date().toISOString()
      })
    }

    console.log(`✅ Google Cloud Vision API access successful`)

    return NextResponse.json({
      status: 'success',
      message: 'Google Cloud Vision is properly configured and accessible',
      projectId: projectId,
      tokenStatus: 'valid',
      apiAccess: 'successful',
      timestamp: new Date().toISOString(),
      nextSteps: [
        'You can now upload medical documents for enhanced OCR processing',
        'Google Cloud Vision will be used as the primary OCR engine',
        'Fallback to OpenAI and Anthropic if Google Vision fails'
      ]
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

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Testing Google Cloud Vision OCR with sample text...')

    const accessToken = process.env.GOOGLE_CLOUD_ACCESS_TOKEN
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID

    if (!accessToken || !projectId) {
      return NextResponse.json({
        status: 'error',
        message: 'Google Cloud credentials not configured'
      }, { status: 400 })
    }

    // Simple test with a sample image (base64 encoded simple text image)
    const sampleImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

    const response = await fetch(`https://vision.googleapis.com/v1/projects/${projectId}/images:annotate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          image: {
            content: sampleImageBase64
          },
          features: [{
            type: 'TEXT_DETECTION',
            maxResults: 10
          }]
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({
        status: 'error',
        message: `Google Cloud Vision OCR test failed: ${response.status}`,
        details: errorText
      }, { status: response.status })
    }

    const result = await response.json()

    return NextResponse.json({
      status: 'success',
      message: 'Google Cloud Vision OCR is working correctly',
      ocrResponse: result,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Google Cloud Vision OCR test error:', error)

    return NextResponse.json({
      status: 'error',
      message: 'Google Cloud Vision OCR test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}