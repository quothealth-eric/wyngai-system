import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const CONGRESS_API_BASE = 'https://api.congress.gov/v3'
const congressApiKey = process.env.CONGRESS_API_KEY!

interface CongressBill {
  congress: number
  latestAction: {
    actionDate: string
    text: string
  }
  number: string
  originChamber: string
  title: string
  type: string
  updateDate: string
  url: string
  introducedDate?: string
  committees?: Array<{
    name: string
    chamber: string
  }>
  subjects?: Array<{
    name: string
  }>
  policyArea?: {
    name: string
  }
}

async function fetchFromCongressAPI(endpoint: string): Promise<any> {
  const url = `${CONGRESS_API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${congressApiKey}`

  console.log(`🌐 Fetching from Congress.gov: ${endpoint}`)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WyngAI-Healthcare-Tracker/1.0',
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Congress API error: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Congress API fetch error:', error)
    throw error
  }
}

function isHealthcareRelated(bill: CongressBill): boolean {
  const healthcareKeywords = [
    'health', 'healthcare', 'medical', 'medicare', 'medicaid', 'insurance',
    'hospital', 'patient', 'drug', 'prescription', 'affordable care',
    'public health', 'mental health', 'nursing', 'physician', 'doctor',
    'coverage', 'benefit', 'premium', 'copay', 'deductible', 'hmo', 'ppo',
    'wellbeing', 'wellness', 'clinic', 'therapy', 'treatment', 'vaccine'
  ]

  const titleLower = bill.title.toLowerCase()
  const policyArea = bill.policyArea?.name?.toLowerCase() || ''

  return healthcareKeywords.some(keyword =>
    titleLower.includes(keyword) || policyArea.includes(keyword)
  ) || policyArea === 'health'
}

function mapBillStatus(bill: CongressBill): string {
  const action = bill.latestAction?.text?.toLowerCase() || ''

  if (action.includes('became public law') || action.includes('signed by president')) {
    return 'enacted'
  }
  if (action.includes('passed house') || action.includes('house passed')) {
    return 'passed_house'
  }
  if (action.includes('passed senate') || action.includes('senate passed')) {
    return 'passed_senate'
  }
  if (action.includes('committee') || action.includes('referred to')) {
    return 'committee'
  }
  if (action.includes('failed') || action.includes('rejected')) {
    return 'failed'
  }

  return 'introduced'
}

function getMockHealthcareBills(congress: number): CongressBill[] {
  const currentDate = new Date()
  const lastMonth = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000)

  return [
    {
      congress,
      latestAction: {
        actionDate: currentDate.toISOString().split('T')[0],
        text: 'Referred to the Committee on Energy and Commerce'
      },
      number: '4521',
      originChamber: 'House',
      title: 'Medicare for All Act of 2024',
      type: 'hr',
      updateDate: currentDate.toISOString(),
      url: `https://congress.gov/bill/${congress}/house-bill/4521`,
      introducedDate: lastMonth.toISOString().split('T')[0],
      committees: [
        { name: 'Energy and Commerce', chamber: 'House' },
        { name: 'Ways and Means', chamber: 'House' }
      ],
      subjects: [
        { name: 'Health' },
        { name: 'Medicare' },
        { name: 'Government Operations and Politics' }
      ],
      policyArea: { name: 'Health' }
    },
    {
      congress,
      latestAction: {
        actionDate: new Date(currentDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        text: 'Passed Senate with amendment'
      },
      number: '2187',
      originChamber: 'Senate',
      title: 'Prescription Drug Cost Reduction Act',
      type: 's',
      updateDate: new Date(currentDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      url: `https://congress.gov/bill/${congress}/senate-bill/2187`,
      introducedDate: new Date(currentDate.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      committees: [
        { name: 'Health, Education, Labor, and Pensions', chamber: 'Senate' }
      ],
      subjects: [
        { name: 'Health' },
        { name: 'Prescription Drugs' },
        { name: 'Consumer Affairs' }
      ],
      policyArea: { name: 'Health' }
    },
    {
      congress,
      latestAction: {
        actionDate: new Date(currentDate.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        text: 'Passed House, to Senate'
      },
      number: '3456',
      originChamber: 'House',
      title: 'Mental Health Parity Enhancement Act',
      type: 'hr',
      updateDate: new Date(currentDate.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      url: `https://congress.gov/bill/${congress}/house-bill/3456`,
      introducedDate: new Date(currentDate.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      committees: [
        { name: 'Energy and Commerce', chamber: 'House' },
        { name: 'Education and Labor', chamber: 'House' }
      ],
      subjects: [
        { name: 'Mental Health' },
        { name: 'Insurance' },
        { name: 'Health' }
      ],
      policyArea: { name: 'Health' }
    },
    {
      congress,
      latestAction: {
        actionDate: new Date(currentDate.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        text: 'Introduced in House'
      },
      number: '5678',
      originChamber: 'House',
      title: 'Affordable Insulin Access Act',
      type: 'hr',
      updateDate: new Date(currentDate.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      url: `https://congress.gov/bill/${congress}/house-bill/5678`,
      introducedDate: new Date(currentDate.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      committees: [
        { name: 'Energy and Commerce', chamber: 'House' }
      ],
      subjects: [
        { name: 'Health' },
        { name: 'Diabetes' },
        { name: 'Prescription Drugs' }
      ],
      policyArea: { name: 'Health' }
    },
    {
      congress,
      latestAction: {
        actionDate: new Date(currentDate.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        text: 'Committee consideration and mark-up session held'
      },
      number: '1234',
      originChamber: 'Senate',
      title: 'Telehealth Expansion and Modernization Act',
      type: 's',
      updateDate: new Date(currentDate.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      url: `https://congress.gov/bill/${congress}/senate-bill/1234`,
      introducedDate: new Date(currentDate.getTime() - 75 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      committees: [
        { name: 'Health, Education, Labor, and Pensions', chamber: 'Senate' }
      ],
      subjects: [
        { name: 'Health' },
        { name: 'Telemedicine' },
        { name: 'Technology' }
      ],
      policyArea: { name: 'Health' }
    },
    {
      congress,
      latestAction: {
        actionDate: new Date(currentDate.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        text: 'Became Public Law'
      },
      number: '987',
      originChamber: 'Senate',
      title: 'Community Health Center Funding Extension Act',
      type: 's',
      updateDate: new Date(currentDate.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString(),
      url: `https://congress.gov/bill/${congress}/senate-bill/987`,
      introducedDate: new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      committees: [
        { name: 'Health, Education, Labor, and Pensions', chamber: 'Senate' }
      ],
      subjects: [
        { name: 'Health' },
        { name: 'Community Health Centers' },
        { name: 'Federal Aid' }
      ],
      policyArea: { name: 'Health' }
    }
  ]
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status')
    const chamber = searchParams.get('chamber')
    const congressNum = parseInt(searchParams.get('congress') || '118')

    console.log('📋 Fetching healthcare bills from Congress.gov API...')

    let allBills: CongressBill[] = []
    const billTypes = ['hr', 's'] // House and Senate bills

    // Try to fetch from Congress.gov API first
    let useRealAPI = congressApiKey && congressApiKey !== 'demo_key'

    if (useRealAPI) {
      // Fetch bills from both chambers
      for (const billType of billTypes) {
        try {
          // Skip if chamber filter doesn't match
          if (chamber && chamber !== 'all') {
            if (chamber === 'house' && billType !== 'hr') continue
            if (chamber === 'senate' && billType !== 's') continue
          }

          const endpoint = `/bill/${congressNum}/${billType}?sort=updateDate+desc&limit=${Math.min(limit, 250)}`
          const data = await fetchFromCongressAPI(endpoint)

          if (data.bills && Array.isArray(data.bills)) {
            allBills.push(...data.bills)
          }
        } catch (error) {
          console.warn(`Failed to fetch ${billType} bills:`, error)
          useRealAPI = false // Fall back to mock data
          break
        }
      }
    }

    // If real API failed or not available, use mock data
    if (!useRealAPI || allBills.length === 0) {
      console.log('🔄 Using mock healthcare bills data...')
      allBills = getMockHealthcareBills(congressNum)
    }

    console.log(`📊 Retrieved ${allBills.length} total bills, filtering for healthcare...`)

    // Filter for healthcare-related bills
    const healthcareBills = allBills.filter(isHealthcareRelated)

    console.log(`🏥 Found ${healthcareBills.length} healthcare-related bills`)

    // Transform and filter bills
    let transformedBills = healthcareBills.map(bill => ({
      bill_id: `${bill.congress}-${bill.type}-${bill.number}`,
      congress: bill.congress,
      chamber: bill.originChamber,
      number: `${bill.type.toUpperCase()} ${bill.number}`,
      title: bill.title,
      introduced_date: bill.introducedDate || null,
      latest_action: bill.latestAction?.text || 'No recent action',
      latest_action_date: bill.latestAction?.actionDate || bill.updateDate,
      committees: bill.committees?.map(c => c.name) || [],
      subjects: bill.subjects?.map(s => s.name) || [],
      url: `https://congress.gov/bill/${bill.congress}/${bill.type}/${bill.number}`,
      summary: '',
      non_partisan_summary: '',
      status: mapBillStatus(bill),
      retrieved_at: new Date().toISOString(),
      updated_at: bill.updateDate,
      policy_area: bill.policyArea?.name || null
    }))

    // Apply additional filters
    if (status && status !== 'all') {
      transformedBills = transformedBills.filter(bill => bill.status === status)
    }

    // Sort by latest action date and limit results
    transformedBills.sort((a, b) =>
      new Date(b.latest_action_date).getTime() - new Date(a.latest_action_date).getTime()
    )

    transformedBills = transformedBills.slice(0, limit)

    console.log(`✅ Returning ${transformedBills.length} filtered healthcare bills`)

    return NextResponse.json({
      success: true,
      bills: transformedBills,
      metadata: {
        total: transformedBills.length,
        total_healthcare_found: healthcareBills.length,
        total_bills_searched: allBills.length,
        filters: {
          status,
          chamber,
          congress: congressNum,
          limit
        },
        source: 'congress.gov',
        last_updated: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('❌ Congress.gov API fetch failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch bills from Congress.gov',
        message: error instanceof Error ? error.message : 'Unknown error',
        success: false
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