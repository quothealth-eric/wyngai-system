import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status')
    const chamber = searchParams.get('chamber')
    const congress = searchParams.get('congress')

    console.log('📋 Fetching healthcare bills from Congress...')

    // Build query for healthcare-related bills
    let query = supabase
      .from('leg_bills')
      .select(`
        bill_id,
        congress,
        chamber,
        number,
        title,
        introduced_date,
        latest_action,
        latest_action_date,
        committees,
        subjects,
        url,
        summary,
        non_partisan_summary,
        status,
        retrieved_at,
        updated_at
      `)
      .order('latest_action_date', { ascending: false })
      .limit(limit)

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (chamber && chamber !== 'all') {
      query = query.eq('chamber', chamber)
    }

    if (congress) {
      query = query.eq('congress', parseInt(congress))
    }

    // Only get bills related to healthcare
    query = query.or(
      `title.ilike.%health%,title.ilike.%medical%,title.ilike.%medicare%,title.ilike.%medicaid%,title.ilike.%insurance%,subjects.cs.{health,healthcare,medical,medicare,medicaid,insurance}`
    )

    const { data: bills, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch bills' },
        { status: 500 }
      )
    }

    // Transform data to match our interface
    const transformedBills = bills?.map(bill => ({
      ...bill,
      committees: Array.isArray(bill.committees) ? bill.committees : [],
      subjects: Array.isArray(bill.subjects) ? bill.subjects : [],
      status: bill.status || 'introduced'
    })) || []

    console.log(`✅ Retrieved ${transformedBills.length} healthcare bills`)

    return NextResponse.json({
      success: true,
      bills: transformedBills,
      metadata: {
        total: transformedBills.length,
        filters: {
          status,
          chamber,
          congress,
          limit
        }
      }
    })

  } catch (error) {
    console.error('❌ Bills fetch failed:', error)
    return NextResponse.json(
      {
        error: 'Bills fetch failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST endpoint to trigger fetching new bills from Congress.gov
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Triggering Congress.gov bill fetch...')

    const body = await request.json()
    const {
      congress = 118,
      forceRefresh = false,
      maxBills = 100
    } = body

    // This would trigger our Congress.gov job
    // For now, we'll return a success message

    return NextResponse.json({
      success: true,
      message: `Triggered fetch for ${congress}th Congress healthcare bills`,
      congress,
      maxBills,
      status: 'queued'
    })

  } catch (error) {
    console.error('❌ Bill fetch trigger failed:', error)
    return NextResponse.json(
      {
        error: 'Bill fetch trigger failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}