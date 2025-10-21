import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'

export async function GET() {
  try {
    console.log('🔍 DEBUG: Fetching recent files')

    // Get recent files
    const { data: files, error: filesError } = await supabaseAdmin
      .from('files')
      .select('id, case_id, file_name, file_type, file_size, storage_path, ocr_text, ocr_confidence, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (filesError) {
      throw filesError
    }

    // Get recent cases
    const { data: cases, error: casesError } = await supabaseAdmin
      .from('cases')
      .select('case_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (casesError) {
      throw casesError
    }

    // Get recent line items count
    const { data: lineItems, error: lineItemsError } = await supabaseAdmin
      .from('line_items')
      .select('session_id, file_id, id')
      .order('extracted_at', { ascending: false })
      .limit(20)

    const lineItemStats = lineItems?.reduce((acc: any, item) => {
      const key = `${item.session_id}_${item.file_id}`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}) || {}

    return NextResponse.json({
      success: true,
      debug: {
        recentFiles: files,
        recentCases: cases,
        lineItemStats,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('❌ Debug endpoint failed:', error)
    return NextResponse.json(
      {
        error: 'Debug query failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}