import { NextRequest, NextResponse } from 'next/server'
import { ImageAnnotatorClient } from '@google-cloud/vision'

export async function GET() {
  try {
    console.log('🧪 Testing Google Cloud Vision API setup...')

    // Check environment variables
    const hasCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS
    const hasProjectId = !!process.env.GOOGLE_CLOUD_PROJECT_ID

    console.log(`🔑 Credentials path: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`)
    console.log(`🆔 Project ID: ${process.env.GOOGLE_CLOUD_PROJECT_ID}`)

    if (!hasCredentials || !hasProjectId) {
      return NextResponse.json({
        success: false,
        message: 'Google Cloud Vision not configured',
        details: {
          has_credentials: hasCredentials,
          has_project_id: hasProjectId,
          credentials_path: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          project_id: process.env.GOOGLE_CLOUD_PROJECT_ID
        }
      }, { status: 500 })
    }

    // Try to initialize the client
    const fs = require('fs')
    const path = require('path')

    let credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    if (!path.isAbsolute(credentialsPath)) {
      credentialsPath = path.join(process.cwd(), credentialsPath)
    }

    console.log(`📂 Reading credentials from: ${credentialsPath}`)

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      return NextResponse.json({
        success: false,
        message: 'Google Cloud credentials file not found',
        credentials_path: credentialsPath
      }, { status: 500 })
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))

    // Initialize client
    const client = new ImageAnnotatorClient({
      credentials,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
    })

    console.log(`✅ Google Cloud Vision client initialized successfully`)

    // Create a simple test image (1x1 white pixel PNG)
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
    const testImageBuffer = Buffer.from(testImageBase64, 'base64')

    console.log(`🖼️ Testing with small image (${testImageBuffer.length} bytes)...`)

    // Test the API with a simple image
    const [result] = await client.textDetection({
      image: {
        content: testImageBuffer
      }
    })

    console.log(`🎯 API call successful!`)

    return NextResponse.json({
      success: true,
      message: 'Google Cloud Vision API is working correctly',
      details: {
        service_account: credentials.client_email,
        project_id: credentials.project_id,
        api_test_result: 'success',
        detections_found: result.textAnnotations?.length || 0
      }
    })

  } catch (error) {
    console.error('❌ Google Cloud Vision test failed:', error)

    return NextResponse.json({
      success: false,
      message: 'Google Cloud Vision test failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Testing Google Cloud Vision with uploaded image...')

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({
        success: false,
        message: 'No file provided for testing'
      }, { status: 400 })
    }

    console.log(`📄 Testing with file: ${file.name} (${file.type}, ${file.size} bytes)`)

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Initialize Google Cloud Vision client
    const fs = require('fs')
    const path = require('path')

    let credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS!
    if (!path.isAbsolute(credentialsPath)) {
      credentialsPath = path.join(process.cwd(), credentialsPath)
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))

    const client = new ImageAnnotatorClient({
      credentials,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
    })

    console.log(`🚀 Calling Google Cloud Vision API with real image...`)

    // Test OCR on the uploaded image
    const [result] = await client.textDetection({
      image: {
        content: buffer
      }
    })

    const detections = result.textAnnotations
    const fullText = detections?.[0]?.description || ''

    console.log(`📝 Extracted ${fullText.length} characters`)

    return NextResponse.json({
      success: true,
      message: 'Google Cloud Vision OCR test completed',
      results: {
        file_name: file.name,
        file_size: file.size,
        text_length: fullText.length,
        detections_count: detections?.length || 0,
        extracted_text: fullText.substring(0, 500), // First 500 chars
        full_text: fullText // Complete text
      }
    })

  } catch (error) {
    console.error('❌ Google Cloud Vision file test failed:', error)

    return NextResponse.json({
      success: false,
      message: 'Google Cloud Vision file test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}