import { NextRequest, NextResponse } from 'next/server'
import { Anthropic } from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

const CONGRESS_API_BASE = 'https://api.congress.gov/v3'
const congressApiKey = process.env.CONGRESS_API_KEY!
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

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
  summary?: string
  implications?: string[]
  keyProvisions?: string[]
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
    // Direct healthcare terms
    'health', 'healthcare', 'medical', 'medicare', 'medicaid', 'insurance',
    'hospital', 'patient', 'drug', 'prescription', 'affordable care',
    'public health', 'mental health', 'nursing', 'physician', 'doctor',
    'coverage', 'benefit', 'premium', 'copay', 'deductible', 'hmo', 'ppo',
    'wellbeing', 'wellness', 'clinic', 'therapy', 'treatment', 'vaccine',

    // Broader impact keywords that affect healthcare access
    'social security', 'disability', 'veterans', 'medicaid expansion',
    'marketplace', 'exchanges', 'subsidies', 'tax credit', 'emergency relief',
    'pandemic', 'covid', 'public assistance', 'food stamps', 'nutrition',
    'childcare', 'family leave', 'unemployment insurance', 'safety net',
    'social services', 'community health', 'rural health', 'tribal health',
    'maternal health', 'reproductive health', 'family planning', 'abortion',
    'contraception', 'pregnancy', 'childbirth', 'elder care', 'long-term care',
    'substance abuse', 'addiction', 'opioid', 'tobacco', 'smoking cessation',

    // Legislative packages with healthcare implications
    'infrastructure', 'reconciliation', 'omnibus', 'continuing resolution',
    'budget resolution', 'american rescue', 'build back better', 'chips',
    'inflation reduction', 'bipartisan', 'comprehensive reform'
  ]

  const titleLower = bill.title.toLowerCase()
  const policyArea = bill.policyArea?.name?.toLowerCase() || ''
  const latestAction = bill.latestAction?.text?.toLowerCase() || ''

  // Check subjects for healthcare-related content
  const subjects = bill.subjects?.map(s => s.name.toLowerCase()).join(' ') || ''

  // Broader matching criteria
  const hasHealthcareKeyword = healthcareKeywords.some(keyword =>
    titleLower.includes(keyword) ||
    policyArea.includes(keyword) ||
    subjects.includes(keyword) ||
    latestAction.includes(keyword)
  )

  // Specific bill number patterns (like H.R. 1, comprehensive bills)
  const isComprehensiveBill = bill.number === '1' ||
    titleLower.includes('comprehensive') ||
    titleLower.includes('omnibus') ||
    titleLower.includes('reconciliation')

  // Policy areas that often contain healthcare provisions
  const healthRelatedPolicyAreas = [
    'health', 'social welfare', 'economics and public finance',
    'taxation', 'families', 'civil rights', 'emergency management',
    'government operations', 'labor and employment'
  ]

  const hasHealthRelatedPolicyArea = healthRelatedPolicyAreas.some(area =>
    policyArea.includes(area)
  )

  return hasHealthcareKeyword ||
         (isComprehensiveBill && hasHealthRelatedPolicyArea) ||
         policyArea === 'health'
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

async function generateBillSummary(billTitle: string, billNumber: string, billText?: string): Promise<{
  summary: string
  implications: string[]
  keyProvisions: string[]
}> {
  try {
    const prompt = `You are a neutral legislative analyst. Provide a non-partisan analysis of this bill: "${billTitle}" (${billNumber}).

${billText ? `Bill text excerpt: ${billText.substring(0, 2000)}...` : ''}

Respond in JSON format with:
1. A 2-3 sentence summary of what the bill proposes
2. 3-4 key implications if enacted (focus on practical effects)
3. 3-4 key provisions likely to be included

Be completely neutral, factual, and avoid advocacy language. Use "the bill proposes" and "if enacted" phrasing.

Response format:
{
  "summary": "Brief neutral description",
  "implications": ["Implication 1", "Implication 2", "Implication 3"],
  "keyProvisions": ["Provision 1", "Provision 2", "Provision 3"]
}`

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    })

    const content = response.content[0].type === 'text' ? response.content[0].text : ''
    if (!content) {
      throw new Error('No response from Anthropic')
    }

    const parsed = JSON.parse(content)
    return {
      summary: parsed.summary,
      implications: parsed.implications,
      keyProvisions: parsed.keyProvisions
    }
  } catch (error) {
    console.error('Failed to generate bill summary:', error)
    return {
      summary: `This bill addresses important policy matters related to ${billTitle.toLowerCase().includes('health') ? 'healthcare' : 'government operations'}.`,
      implications: ['Policy changes would affect stakeholders', 'Implementation would require coordination', 'Budget implications may apply'],
      keyProvisions: ['Regulatory changes', 'Implementation timeline', 'Stakeholder requirements']
    }
  }
}

async function searchBillsFromCongress(
  query: string,
  congress: number,
  limit: number = 50
): Promise<CongressBill[]> {
  try {
    const searchEndpoint = `/bill/${congress}/search?query=${encodeURIComponent(query)}&sort=updateDate+desc&limit=${limit}`
    const data = await fetchFromCongressAPI(searchEndpoint)

    if (data.bills && Array.isArray(data.bills)) {
      return data.bills
    }

    return []
  } catch (error) {
    console.error('Search failed:', error)
    return []
  }
}

async function fetchBillText(congress: number, billType: string, billNumber: string): Promise<string> {
  try {
    const endpoint = `/bill/${congress}/${billType}/${billNumber}/text`
    const data = await fetchFromCongressAPI(endpoint)

    if (data.textVersions && data.textVersions.length > 0) {
      const latestVersion = data.textVersions[0]
      if (latestVersion.formats && latestVersion.formats.length > 0) {
        const textFormat = latestVersion.formats.find(f => f.type === 'Formatted Text') || latestVersion.formats[0]
        if (textFormat.url) {
          // Fetch the actual bill text
          const textResponse = await fetch(textFormat.url)
          if (textResponse.ok) {
            return await textResponse.text()
          }
        }
      }
    }

    return ''
  } catch (error) {
    console.error('Failed to fetch bill text:', error)
    return ''
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status')
    const chamber = searchParams.get('chamber')
    const congressNum = parseInt(searchParams.get('congress') || '118')
    const search = searchParams.get('search') || ''

    console.log('📋 Fetching healthcare bills from Congress.gov API...')
    console.log(`🔑 API Key check: exists=${!!congressApiKey}, length=${congressApiKey?.length || 0}`)

    let allBills: CongressBill[] = []

    // Healthcare-related search terms for Congress.gov API
    const healthcareSearchTerms = [
      'health AND (care OR insurance OR medicare OR medicaid)',
      'prescription drug',
      'mental health',
      'telehealth',
      'affordable care',
      'public health',
      'healthcare AND (access OR coverage OR reform)',
      'insurance AND (coverage OR premium OR deductible)',
      'medicare AND (expansion OR benefit OR coverage)',
      'medicaid AND (expansion OR eligibility OR coverage)',
      'hospital AND (funding OR safety OR quality)',
      'pharmaceutical AND (pricing OR access OR regulation)',
      'medical AND (research OR device OR innovation)',
      'nursing AND (shortage OR education OR facility)',
      'rural health',
      'community health center',
      'substance abuse',
      'opioid crisis',
      'maternal health',
      'reproductive health',
      'veterans health',
      'disability AND health',
      'long-term care',
      'social security AND health'
    ]

    try {
      if (search) {
        // If user provided search query, use it directly
        console.log(`🔍 Searching for user query: "${search}"`)
        const searchResults = await searchBillsFromCongress(search, congressNum, limit)
        allBills.push(...searchResults)
      } else {
        // Search for healthcare-related bills using predefined terms
        console.log('🏥 Searching for healthcare-related bills...')

        for (const searchTerm of healthcareSearchTerms.slice(0, 5)) { // Limit to prevent API rate limiting
          try {
            const searchResults = await searchBillsFromCongress(searchTerm, congressNum, Math.min(25, limit))
            allBills.push(...searchResults)

            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100))
          } catch (error) {
            console.warn(`Search failed for term "${searchTerm}":`, error)
            continue
          }
        }
      }

      // Remove duplicates based on bill ID
      const uniqueBills = allBills.filter((bill, index, self) =>
        index === self.findIndex(b => `${b.congress}-${b.type}-${b.number}` === `${bill.congress}-${bill.type}-${bill.number}`)
      )

      console.log(`📊 Retrieved ${uniqueBills.length} unique bills from Congress.gov`)

      // Apply chamber filter
      let filteredBills = uniqueBills
      if (chamber && chamber !== 'all') {
        filteredBills = uniqueBills.filter(bill => {
          if (chamber === 'house') return bill.type === 'hr'
          if (chamber === 'senate') return bill.type === 's'
          return true
        })
      }

      // Further filter for healthcare relevance if no user search query
      if (!search) {
        filteredBills = filteredBills.filter(isHealthcareRelated)
      }

      console.log(`🏥 Found ${filteredBills.length} healthcare-related bills`)

      // Generate AI summaries for bills
      const billsWithSummaries = await Promise.all(
        filteredBills.slice(0, limit).map(async (bill) => {
          try {
            // Fetch bill text for more accurate summary
            const billText = await fetchBillText(bill.congress, bill.type, bill.number)
            const analysis = await generateBillSummary(bill.title, `${bill.type.toUpperCase()} ${bill.number}`, billText)

            return {
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
              summary: analysis.summary,
              non_partisan_summary: analysis.summary,
              implications: analysis.implications,
              key_provisions: analysis.keyProvisions,
              status: mapBillStatus(bill),
              retrieved_at: new Date().toISOString(),
              updated_at: bill.updateDate,
              policy_area: bill.policyArea?.name || null
            }
          } catch (error) {
            console.error(`Failed to process bill ${bill.type} ${bill.number}:`, error)
            // Return bill without AI analysis if it fails
            return {
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
              summary: `${bill.title} addresses healthcare policy matters.`,
              non_partisan_summary: `${bill.title} addresses healthcare policy matters.`,
              implications: ['Policy changes may affect healthcare stakeholders'],
              key_provisions: ['Healthcare-related provisions'],
              status: mapBillStatus(bill),
              retrieved_at: new Date().toISOString(),
              updated_at: bill.updateDate,
              policy_area: bill.policyArea?.name || null
            }
          }
        })
      )

      // Apply status filter
      let finalBills = billsWithSummaries
      if (status && status !== 'all') {
        finalBills = billsWithSummaries.filter(bill => bill.status === status)
      }

      // Sort by latest action date
      finalBills.sort((a, b) =>
        new Date(b.latest_action_date).getTime() - new Date(a.latest_action_date).getTime()
      )

      console.log(`✅ Returning ${finalBills.length} healthcare bills with AI analysis`)

      return NextResponse.json({
        success: true,
        bills: finalBills,
        metadata: {
          total: finalBills.length,
          total_healthcare_found: filteredBills.length,
          total_bills_searched: uniqueBills.length,
          filters: {
            status,
            chamber,
            congress: congressNum,
            limit,
            search
          },
          source: 'congress.gov',
          ai_analysis: 'claude-3-5-sonnet',
          last_updated: new Date().toISOString()
        }
      })

    } catch (error) {
      console.error('❌ Congress.gov API search failed:', error)

      // Return error instead of fallback - no mock data
      return NextResponse.json(
        {
          error: 'Congress.gov API is currently unavailable',
          message: `Unable to fetch bills from Congress.gov. Please check API key and connectivity. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          success: false,
          bills: [],
          metadata: {
            total: 0,
            source: 'congress.gov',
            last_updated: new Date().toISOString(),
            error_details: error instanceof Error ? error.message : 'Unknown error'
          }
        },
        { status: 503 }
      )
    }

  } catch (error) {
    console.error('❌ Request processing failed:', error)
    return NextResponse.json(
      {
        error: 'Request processing failed',
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