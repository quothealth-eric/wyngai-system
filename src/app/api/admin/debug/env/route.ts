import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  // Check environment variables and configurations
  const envCheck = {
    // Supabase
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,

    // Google Cloud
    GOOGLE_APPLICATION_CREDENTIALS_JSON: !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    GCP_SA_KEY_B64: !!process.env.GCP_SA_KEY_B64,
    STORAGE_BUCKET: !!process.env.STORAGE_BUCKET,

    // OpenAI
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,

    // Storage bucket value (for debugging)
    storageBucketValue: process.env.STORAGE_BUCKET || 'NOT_SET'
  }

  // Test Supabase connection
  let supabaseTest = 'NOT_TESTED'
  try {
    const { supabaseAdmin } = await import('@/lib/db')
    const { data, error } = await supabaseAdmin
      .from('cases')
      .select('case_id')
      .limit(1)

    if (error) {
      supabaseTest = `ERROR: ${error.message}`
    } else {
      supabaseTest = 'SUCCESS'
    }
  } catch (error) {
    supabaseTest = `EXCEPTION: ${error instanceof Error ? error.message : error}`
  }

  // Test Google Cloud Vision availability
  let visionTest = 'NOT_TESTED'
  try {
    const { isVisionAvailable } = await import('@/lib/ocr/gcv')
    visionTest = isVisionAvailable() ? 'AVAILABLE' : 'NOT_AVAILABLE'
  } catch (error) {
    visionTest = `ERROR: ${error instanceof Error ? error.message : error}`
  }

  return NextResponse.json({
    environment: envCheck,
    supabaseConnection: supabaseTest,
    googleCloudVision: visionTest,
    timestamp: new Date().toISOString()
  })
}