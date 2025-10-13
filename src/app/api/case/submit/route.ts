import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'

export async function POST(request: NextRequest) {
  console.log('📋 Processing case submission')

  try {
    const body = await request.json()
    const { caseId, description, insurance } = body

    if (!caseId) {
      return NextResponse.json(
        { error: 'Case ID is required' },
        { status: 400 }
      )
    }

    if (!description || description.trim().length < 10) {
      return NextResponse.json(
        { error: 'Description must be at least 10 characters' },
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

    // Upsert case profile
    const { error: profileError } = await supabaseAdmin
      .from('case_profile')
      .upsert({
        case_id: caseId,
        description: description.trim(),
        insurance: insurance || {}
      })

    if (profileError) {
      console.error('❌ Failed to save case profile:', profileError)
      return NextResponse.json(
        { error: 'Failed to save case profile', details: profileError.message },
        { status: 500 }
      )
    }

    // Update case status
    const { error: statusError } = await supabaseAdmin
      .from('cases')
      .update({ status: 'submitted' })
      .eq('case_id', caseId)

    if (statusError) {
      console.error('❌ Failed to update case status:', statusError)
      return NextResponse.json(
        { error: 'Failed to update case status', details: statusError.message },
        { status: 500 }
      )
    }

    console.log(`✅ Case ${caseId} submitted successfully`)

    return NextResponse.json({
      caseId,
      status: 'submitted',
      message: 'Case submitted successfully'
    })

  } catch (error) {
    console.error('❌ Case submit error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}