import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'

// Simple admin token authentication
function validateAdminToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  const adminToken = process.env.ADMIN_TOKEN

  if (!adminToken) {
    console.warn('ADMIN_TOKEN not configured')
    return false
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.substring(7) // Remove 'Bearer ' prefix
  return token === adminToken
}

export async function GET(request: NextRequest) {
  try {
    // Validate admin access
    if (!validateAdminToken(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const format = url.searchParams.get('format') || 'json'
    const startDate = url.searchParams.get('start_date')
    const endDate = url.searchParams.get('end_date')
    const limit = parseInt(url.searchParams.get('limit') || '1000')

    // Log admin access
    const clientIp = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown'

    await supabaseAdmin
      .from('admin_logs')
      .insert({
        action: 'export_cases',
        admin_identifier: 'api_access',
        details: { format, startDate, endDate, limit },
        ip_address: clientIp
      })

    // Build query
    let query = supabaseAdmin
      .from('cases')
      .select(`
        id,
        created_at,
        updated_at,
        status,
        session_id,
        user_question,
        user_benefits,
        llm_response,
        leads (
          id,
          email,
          name,
          is_investor
        ),
        files (
          id,
          file_name,
          file_type,
          file_size,
          ocr_confidence
        ),
        donations (
          id,
          amount_cents,
          currency,
          status,
          completed_at
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Apply date filters if provided
    if (startDate) {
      query = query.gte('created_at', startDate)
    }
    if (endDate) {
      query = query.lte('created_at', endDate)
    }

    const { data: cases, error } = await query

    if (error) {
      console.error('Error fetching cases:', error)
      return NextResponse.json(
        { error: 'Failed to fetch cases' },
        { status: 500 }
      )
    }

    // Format the response based on requested format
    if (format === 'csv') {
      const csvData = convertToCsv(cases)

      return new NextResponse(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="wyng_lite_cases_${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
    }

    // Default JSON response
    return NextResponse.json({
      cases,
      metadata: {
        total: cases.length,
        exported_at: new Date().toISOString(),
        filters: { startDate, endDate, limit }
      }
    })

  } catch (error) {
    console.error('Admin export error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function convertToCsv(cases: any[]): string {
  if (cases.length === 0) {
    return 'No data available'
  }

  // Define CSV headers
  const headers = [
    'Case ID',
    'Created At',
    'Status',
    'Session ID',
    'User Question (Truncated)',
    'Lead Email',
    'Lead Name',
    'Is Investor',
    'Files Count',
    'Donation Amount',
    'Donation Status',
    'LLM Confidence',
    'Needs Appeal',
    'Errors Detected Count'
  ]

  // Convert cases to CSV rows
  const rows = cases.map(caseItem => {
    const lead = caseItem.leads?.[0]
    const donation = caseItem.donations?.[0]
    const llmResponse = caseItem.llm_response

    return [
      caseItem.id,
      caseItem.created_at,
      caseItem.status,
      caseItem.session_id || '',
      (caseItem.user_question || '').substring(0, 100).replace(/"/g, '""'), // Truncate and escape quotes
      lead?.email || '',
      lead?.name || '',
      lead?.is_investor ? 'Yes' : 'No',
      caseItem.files?.length || 0,
      donation ? (donation.amount_cents / 100) : '',
      donation?.status || '',
      llmResponse?.confidence || '',
      llmResponse?.needs_appeal ? 'Yes' : 'No',
      llmResponse?.errors_detected?.length || 0
    ]
  })

  // Combine headers and rows
  const allRows = [headers, ...rows]

  // Convert to CSV string
  return allRows
    .map(row =>
      row.map(cell =>
        typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
          ? `"${cell}"`
          : cell
      ).join(',')
    )
    .join('\n')
}

// GET endpoint for leads export
export async function POST(request: NextRequest) {
  try {
    // Validate admin access
    if (!validateAdminToken(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { export_type } = body // 'leads', 'donations', etc.

    const clientIp = request.headers.get('x-forwarded-for') || 'unknown'

    // Log admin access
    await supabaseAdmin
      .from('admin_logs')
      .insert({
        action: `export_${export_type}`,
        admin_identifier: 'api_access',
        details: body,
        ip_address: clientIp
      })

    if (export_type === 'leads') {
      const { data: leads, error } = await supabaseAdmin
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      return NextResponse.json({ leads })
    }

    if (export_type === 'donations') {
      const { data: donations, error } = await supabaseAdmin
        .from('donations')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      return NextResponse.json({ donations })
    }

    return NextResponse.json(
      { error: 'Invalid export type' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Admin export POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}