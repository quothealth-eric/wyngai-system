import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth, createAdminResponse } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  // Require admin authentication
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🔍 Admin: Fetching cases summary')

    // Fetch cases summary using the view
    const { data: cases, error } = await supabaseAdmin
      .from('v_case_summary')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Failed to fetch cases:', error)
      return NextResponse.json(
        { error: 'Failed to fetch cases', details: error.message },
        { status: 500 }
      )
    }

    console.log(`✅ Admin: Found ${cases?.length || 0} cases`)

    return createAdminResponse({
      cases: cases || [],
      totalCases: cases?.length || 0,
      statusCounts: {
        submitted: cases?.filter(c => c.status === 'submitted').length || 0,
        processing: cases?.filter(c => c.status === 'processing').length || 0,
        ready: cases?.filter(c => c.status === 'ready').length || 0,
        emailed: cases?.filter(c => c.status === 'emailed').length || 0
      }
    })

  } catch (error) {
    console.error('❌ Admin cases API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}