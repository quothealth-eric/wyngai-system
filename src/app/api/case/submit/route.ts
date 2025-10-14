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
    // Clean insurance object to remove null values
    const cleanInsurance: any = {}
    if (insurance) {
      Object.keys(insurance).forEach(key => {
        if (insurance[key] !== null && insurance[key] !== '') {
          cleanInsurance[key] = insurance[key]
        }
      })
    }

    const profileData = {
      case_id: caseId,
      description: description.trim(),
      insurance: Object.keys(cleanInsurance).length > 0 ? cleanInsurance : {}
    }
    console.log('📝 Saving case profile:', JSON.stringify(profileData, null, 2))

    const { data: profileResult, error: profileError } = await supabaseAdmin
      .from('case_profile')
      .upsert(profileData)
      .select()

    console.log('📝 Profile upsert result:', profileResult)
    console.log('📝 Profile upsert error:', profileError)

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
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })

  } catch (error) {
    console.error('❌ Case submit error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
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