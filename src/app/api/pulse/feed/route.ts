import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const state = searchParams.get('state')
    const authority = searchParams.get('authority')
    const limit = parseInt(searchParams.get('limit') || '10')

    console.log('📰 Fetching policy pulse feed...')

    let query = supabaseAdmin
      .from('policy_pulse')
      .select('*')
      .order('pinned', { ascending: false })
      .order('effective_date', { ascending: false })
      .limit(limit)

    // Apply filters
    if (state) {
      query = query.or(`jurisdiction.eq.${state},jurisdiction.eq.US,jurisdiction.is.null`)
    }

    if (authority) {
      query = query.eq('authority', authority)
    }

    const { data: pulseItems, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch pulse feed' },
        { status: 500 }
      )
    }

    console.log(`✅ Retrieved ${pulseItems?.length || 0} pulse items`)

    return NextResponse.json({
      success: true,
      items: pulseItems || [],
      filters: {
        state,
        authority,
        limit
      }
    })

  } catch (error) {
    console.error('❌ Policy pulse feed failed:', error)
    return NextResponse.json(
      {
        error: 'Feed fetch failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}