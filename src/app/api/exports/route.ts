/**
 * Export API Route
 * Handles PDF, email, SMS, and link exports for WyngAI responses
 */

import { NextRequest, NextResponse } from 'next/server'
import { ExportManager, ExportRequest } from '@/lib/exports/export-manager'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

const exportManager = new ExportManager()

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      chatId,
      messageId,
      exportType,
      emailAddress,
      phoneNumber,
      includeFullThread = false
    } = body

    // Validate required fields
    if (!chatId || !messageId || !exportType) {
      return NextResponse.json(
        { error: 'chatId, messageId, and exportType are required' },
        { status: 400 }
      )
    }

    // Validate export type
    const validExportTypes = ['pdf', 'email', 'sms', 'link']
    if (!validExportTypes.includes(exportType)) {
      return NextResponse.json(
        { error: `Invalid export type. Must be one of: ${validExportTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate email address for email exports
    if (exportType === 'email' && !emailAddress) {
      return NextResponse.json(
        { error: 'Email address is required for email exports' },
        { status: 400 }
      )
    }

    // Validate phone number for SMS exports
    if (exportType === 'sms' && !phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required for SMS exports' },
        { status: 400 }
      )
    }

    console.log(`📤 Processing ${exportType} export for chat ${chatId}, message ${messageId}`)

    const exportRequest: ExportRequest = {
      chatId,
      messageId,
      exportType,
      emailAddress,
      phoneNumber,
      includeFullThread
    }

    const result = await exportManager.exportResponse(exportRequest)

    if (result.status === 'failed') {
      return NextResponse.json(
        {
          error: 'Export failed',
          details: result.errorMessage
        },
        { status: 500 }
      )
    }

    console.log(`✅ ${exportType} export completed: ${result.exportId}`)

    // Analytics
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE!
      )

      await supabase.from('analytics_events').insert({
        chat_id: chatId,
        event_name: 'export_requested',
        event_params: {
          export_type: exportType,
          export_id: result.exportId,
          status: result.status,
          include_full_thread: includeFullThread
        }
      })
    } catch (analyticsError) {
      console.error('Analytics error:', analyticsError)
      // Don't fail the request for analytics issues
    }

    return NextResponse.json({
      success: true,
      exportId: result.exportId,
      exportType,
      status: result.status,
      ...(result.signedUrl && { url: result.signedUrl }),
      ...(result.expiresAt && { expiresAt: result.expiresAt.toISOString() }),
      message: getSuccessMessage(exportType, emailAddress, phoneNumber)
    })

  } catch (error) {
    console.error('❌ Export API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to process export request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const exportId = url.searchParams.get('exportId')

  if (!exportId) {
    return NextResponse.json(
      { error: 'exportId parameter is required' },
      { status: 400 }
    )
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    )

    const { data, error } = await supabase
      .from('export_requests')
      .select('*')
      .eq('export_id', exportId)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Export not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      exportId: data.export_id,
      exportType: data.export_type,
      status: data.status,
      createdAt: data.created_at,
      completedAt: data.completed_at,
      ...(data.signed_url && { url: data.signed_url }),
      ...(data.expires_at && { expiresAt: data.expires_at }),
      ...(data.error_message && { errorMessage: data.error_message })
    })

  } catch (error) {
    console.error('❌ Export status check error:', error)
    return NextResponse.json(
      {
        error: 'Failed to check export status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Generate success message based on export type
 */
function getSuccessMessage(
  exportType: string,
  emailAddress?: string,
  phoneNumber?: string
): string {
  switch (exportType) {
    case 'pdf':
      return 'PDF generated successfully. Use the provided URL to download your file.'
    case 'email':
      return `Email sent successfully to ${emailAddress}. Check your inbox for your WyngAI guidance.`
    case 'sms':
      return `SMS sent successfully to ${phoneNumber}. Check your messages for the link.`
    case 'link':
      return 'Shareable link generated successfully. This link will expire in 7 days.'
    default:
      return 'Export completed successfully.'
  }
}