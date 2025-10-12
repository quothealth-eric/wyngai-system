import { NextResponse } from 'next/server'
import { getGoogleVisionClient } from '@/lib/google-vision-client'

export async function GET() {
  try {
    console.log('🔍 Debugging Google Cloud Vision environment setup...')

    // Check all possible environment variables
    const envCheck = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: !!process.env.VERCEL,
      GOOGLE_APPLICATION_CREDENTIALS: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      GOOGLE_CLOUD_PROJECT_ID: !!process.env.GOOGLE_CLOUD_PROJECT_ID,
      // Also check for alternative env var names that might be used
      GOOGLE_CREDENTIALS: !!process.env.GOOGLE_CREDENTIALS,
      GOOGLE_APPLICATION_CREDENTIALS_JSON: !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
      GCP_PROJECT: !!process.env.GCP_PROJECT,
      GCLOUD_PROJECT: !!process.env.GCLOUD_PROJECT,
      // Show partial values for debugging (first 50 chars)
      GOOGLE_CREDENTIALS_PREVIEW: process.env.GOOGLE_CREDENTIALS ?
        process.env.GOOGLE_CREDENTIALS.substring(0, 50) + '...' : null,
      GOOGLE_APPLICATION_CREDENTIALS_JSON_PREVIEW: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON.substring(0, 50) + '...' : null
    }

    console.log('📋 Environment variables check:', envCheck)

    // Try to initialize the client
    console.log('🚀 Attempting to initialize Google Vision client...')
    const client = getGoogleVisionClient()

    if (!client) {
      return NextResponse.json({
        success: false,
        message: 'Google Cloud Vision client initialization failed',
        environment: envCheck,
        suggestions: [
          'In Vercel dashboard, add GOOGLE_CLOUD_PROJECT_ID environment variable with value: wyng-medical-ocr',
          'Add GOOGLE_APPLICATION_CREDENTIALS_JSON with the full JSON content of your service account key',
          'Make sure the service account has "Cloud Vision API User" role',
          'Verify the Vision API is enabled in your Google Cloud project'
        ]
      }, { status: 500 })
    }

    console.log('✅ Google Vision client initialized successfully')

    return NextResponse.json({
      success: true,
      message: 'Google Cloud Vision client is working',
      environment: envCheck,
      client_status: 'initialized'
    })

  } catch (error) {
    console.error('❌ Google Vision environment debug failed:', error)

    return NextResponse.json({
      success: false,
      message: 'Google Vision environment debug failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}