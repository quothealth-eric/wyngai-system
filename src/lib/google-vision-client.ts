import { ImageAnnotatorClient } from '@google-cloud/vision'

// Dedicated Google Cloud Vision client setup
// This handles the Vercel/serverless environment properly

let visionClient: ImageAnnotatorClient | null = null

export function initializeGoogleVisionClient(): ImageAnnotatorClient | null {
  // Return existing client if already initialized
  if (visionClient) {
    return visionClient
  }

  try {
    console.log('🔍 Initializing Google Cloud Vision client...')

    // Check environment variables first
    const hasCredentialsPath = !!process.env.GOOGLE_APPLICATION_CREDENTIALS
    const hasProjectId = !!process.env.GOOGLE_CLOUD_PROJECT_ID

    console.log(`📋 Environment check:`)
    console.log(`  - GOOGLE_APPLICATION_CREDENTIALS: ${hasCredentialsPath ? '✓' : '❌'}`)
    console.log(`  - GOOGLE_CLOUD_PROJECT_ID: ${hasProjectId ? '✓' : '❌'}`)

    if (!hasCredentialsPath || !hasProjectId) {
      console.error('❌ Missing required environment variables for Google Cloud Vision')
      return null
    }

    // In Vercel, we need to handle credentials differently
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      console.log('🌐 Detected Vercel/production environment')

      // For Vercel, we need to use the JSON credentials as environment variable
      let credentials = null

      // Try to get credentials from environment variable
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        console.log('📋 Using GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable')
        try {
          credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
        } catch (parseError) {
          console.error('❌ Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', parseError)
          return null
        }
      } else if (process.env.GOOGLE_CREDENTIALS) {
        console.log('📋 Using GOOGLE_CREDENTIALS environment variable')
        try {
          credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS)
        } catch (parseError) {
          console.error('❌ Failed to parse GOOGLE_CREDENTIALS:', parseError)
          return null
        }
      }

      if (credentials) {
        visionClient = new ImageAnnotatorClient({
          credentials,
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id
        })
        console.log('✅ Google Cloud Vision client initialized for Vercel with JSON credentials')
      } else {
        // Fall back to default authentication (if service account is configured in Vercel)
        visionClient = new ImageAnnotatorClient({
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
        })
        console.log('✅ Google Cloud Vision client initialized for Vercel with default auth')
      }

    } else {
      console.log('💻 Detected local development environment')

      // For local development, use the credentials file
      const fs = require('fs')
      const path = require('path')

      let credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
      if (!path.isAbsolute(credentialsPath)) {
        credentialsPath = path.join(process.cwd(), credentialsPath)
      }

      console.log(`📂 Reading credentials from: ${credentialsPath}`)

      // Check if credentials file exists
      if (!fs.existsSync(credentialsPath)) {
        console.error(`❌ Credentials file not found: ${credentialsPath}`)
        return null
      }

      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))

      visionClient = new ImageAnnotatorClient({
        credentials,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      })

      console.log(`✅ Google Cloud Vision client initialized for local development`)
      console.log(`📧 Using service account: ${credentials.client_email}`)
    }

    return visionClient

  } catch (error) {
    console.error('❌ Failed to initialize Google Cloud Vision client:', error)

    if (error instanceof Error) {
      console.error(`❌ Error details: ${error.name} - ${error.message}`)
      console.error(`❌ Stack trace: ${error.stack}`)
    }

    return null
  }
}

export function getGoogleVisionClient(): ImageAnnotatorClient | null {
  if (!visionClient) {
    return initializeGoogleVisionClient()
  }
  return visionClient
}