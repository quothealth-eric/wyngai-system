import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { headers } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const headersList = headers()
    const userIp = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'
    const userAgent = headersList.get('user-agent') || 'unknown'

    console.log('🆕 Creating new case session')

    // Create new case
    const { data: caseData, error: caseError } = await supabaseAdmin
      .from('cases')
      .insert({
        status: 'submitted',
        user_ip: userIp,
        user_agent: userAgent
      })
      .select('case_id')
      .single()

    if (caseError) {
      console.error('❌ Failed to create case:', caseError)
      return NextResponse.json(
        { error: 'Failed to create case', details: caseError.message },
        { status: 500 }
      )
    }

    console.log(`✅ Case created: ${caseData.case_id}`)

    return NextResponse.json({
      caseId: caseData.case_id,
      status: 'created'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })

  } catch (error) {
    console.error('❌ Case init error:', error)
    return NextResponse.json(
      { error: 'Failed to create case', details: error instanceof Error ? error.message : 'Unknown error' },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}