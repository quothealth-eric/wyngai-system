import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth, createAdminResponse } from '@/lib/admin/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  // Require admin authentication
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log(`🔍 Admin: Fetching case details for ${params.caseId}`)

    // Fetch case with profile
    const { data: caseData, error: caseError } = await supabaseAdmin
      .from('cases')
      .select(`
        *,
        case_profile (*)
      `)
      .eq('case_id', params.caseId)
      .single()

    console.log('🔍 Raw case data from DB:', JSON.stringify(caseData, null, 2))

    if (caseError || !caseData) {
      console.error('❌ Case not found:', caseError)
      return NextResponse.json(
        { error: 'Case not found', details: caseError?.message },
        { status: 404 }
      )
    }

    // Fetch files
    const { data: files, error: filesError } = await supabaseAdmin
      .from('case_files')
      .select('*')
      .eq('case_id', params.caseId)
      .order('uploaded_at', { ascending: true })

    if (filesError) {
      console.error('❌ Failed to fetch files:', filesError)
      return NextResponse.json(
        { error: 'Failed to fetch files', details: filesError.message },
        { status: 500 }
      )
    }

    // Fetch OCR extractions
    const { data: extractions, error: extractionsError } = await supabaseAdmin
      .from('ocr_extractions')
      .select('*')
      .eq('case_id', params.caseId)
      .order('page', { ascending: true })

    if (extractionsError) {
      console.error('❌ Failed to fetch extractions:', extractionsError)
      return NextResponse.json(
        { error: 'Failed to fetch extractions', details: extractionsError.message },
        { status: 500 }
      )
    }

    // Fetch detections
    const { data: detections, error: detectionsError } = await supabaseAdmin
      .from('case_detections')
      .select('*')
      .eq('case_id', params.caseId)
      .order('created_at', { ascending: false })

    if (detectionsError) {
      console.error('❌ Failed to fetch detections:', detectionsError)
      return NextResponse.json(
        { error: 'Failed to fetch detections', details: detectionsError.message },
        { status: 500 }
      )
    }

    // Combine all data
    console.log('🔍 case_profile data:', caseData.case_profile)

    // Since case_profile has 1:1 relationship with cases, it could be either an object or array
    const profile = Array.isArray(caseData.case_profile)
      ? caseData.case_profile[0]
      : caseData.case_profile

    const caseDetail = {
      case_id: caseData.case_id,
      created_at: caseData.created_at,
      status: caseData.status,
      submit_email: caseData.submit_email,
      user_ip: caseData.user_ip,
      user_agent: caseData.user_agent,
      description: profile?.description || null,
      insurance: profile?.insurance || null,
      files: files || [],
      extractions: extractions || [],
      detections: detections || []
    }

    console.log('📤 Final case detail response:', JSON.stringify(caseDetail, null, 2))

    console.log(`✅ Admin: Case details fetched - ${files?.length || 0} files, ${extractions?.length || 0} extractions, ${detections?.length || 0} detections`)

    return createAdminResponse({
      case: caseDetail
    })

  } catch (error) {
    console.error('❌ Admin case detail API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}