import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'

export async function POST(request: NextRequest) {
  console.log('📧 Processing email capture')

  try {
    const body = await request.json()
    const { caseId, email } = body

    if (!caseId) {
      return NextResponse.json(
        { error: 'Case ID is required' },
        { status: 400 }
      )
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      )
    }

    // Verify case exists
    const { data: caseExists } = await supabaseAdmin
      .from('cases')
      .select('case_id')
      .eq('case_id', caseId)
      .single()

    if (!caseExists) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      )
    }

    // Update case with email
    const { error: updateError } = await supabaseAdmin
      .from('cases')
      .update({ submit_email: email.toLowerCase().trim() })
      .eq('case_id', caseId)

    if (updateError) {
      console.error('❌ Failed to save email:', updateError)
      return NextResponse.json(
        { error: 'Failed to save email', details: updateError.message },
        { status: 500 }
      )
    }

    // Log audit event
    await supabaseAdmin
      .from('case_audit')
      .insert({
        case_id: caseId,
        event: 'email_captured',
        details: { email: email.toLowerCase().trim() }
      })

    console.log(`✅ Email captured for case ${caseId}: ${email}`)

    return NextResponse.json({
      caseId,
      status: 'email_captured',
      message: 'Email captured successfully'
    })

  } catch (error) {
    console.error('❌ Email capture error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}