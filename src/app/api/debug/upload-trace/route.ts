import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'

export async function GET() {
  try {
    console.log('🔍 Tracing recent upload attempts...')

    // Get recent files and their OCR status
    const { data: recentFiles, error: filesError } = await supabaseAdmin
      .from('files')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    if (filesError) {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to fetch recent files',
        error: filesError.message
      }, { status: 500 })
    }

    // Get recent cases
    const { data: recentCases, error: casesError } = await supabaseAdmin
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    if (casesError) {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to fetch recent cases',
        error: casesError.message
      }, { status: 500 })
    }

    // Get recent line items
    const { data: recentLineItems, error: lineItemsError } = await supabaseAdmin
      .from('line_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (lineItemsError) {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to fetch recent line items',
        error: lineItemsError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      status: 'success',
      message: 'Upload trace completed',
      data: {
        recentFiles: recentFiles?.map(file => ({
          id: file.id,
          filename: file.file_name,
          type: file.file_type,
          size: file.file_size,
          ocrText: file.ocr_text,
          ocrConfidence: file.ocr_confidence,
          createdAt: file.created_at
        })) || [],
        recentCases: recentCases?.map(case_ => ({
          id: case_.id,
          status: case_.status,
          sessionId: case_.session_id,
          response: case_.llm_response,
          createdAt: case_.created_at
        })) || [],
        recentLineItems: recentLineItems?.map(item => ({
          id: item.id,
          fileId: item.file_id,
          caseId: item.case_id,
          cptCode: item.cpt_code,
          description: item.code_description,
          chargeAmount: item.charge_amount,
          confidence: item.confidence_score,
          createdAt: item.created_at
        })) || [],
        totals: {
          filesCount: recentFiles?.length || 0,
          casesCount: recentCases?.length || 0,
          lineItemsCount: recentLineItems?.length || 0
        }
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Upload trace error:', error)

    return NextResponse.json({
      status: 'error',
      message: 'Upload trace failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}