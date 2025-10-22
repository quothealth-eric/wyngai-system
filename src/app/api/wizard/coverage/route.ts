import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { anthropic } from '@/lib/anthropic'

export const runtime = 'nodejs'
export const maxDuration = 30

interface CoverageSlots {
  state?: string
  currentCoverage?: string // employer|marketplace|medicaid|medicare|cobra|none
  household?: {
    spouse: boolean
    children: number
  }
  qualifyingEvent?: string // loss|move|birth|marriage|none|unknown
}

export async function POST(request: NextRequest) {
  try {
    console.log('🧙‍♀️ Starting Coverage Decision Wizard...')

    const body = await request.json()
    const { threadId, text, slots } = body

    if (!threadId || !text) {
      return NextResponse.json(
        { error: 'threadId and text are required' },
        { status: 400 }
      )
    }

    // Extract slots from text if not provided
    let extractedSlots: CoverageSlots = slots || {}

    if (!slots) {
      console.log('🔍 Extracting coverage slots...')

      const extractorPrompt = `Extract coverage information from this text and return JSON:

Text: "${text}"

Extract these fields:
- state: US state abbreviation (e.g., "FL", "CA", "TX")
- currentCoverage: employer|marketplace|medicaid|medicare|cobra|none
- household: {spouse: boolean, children: number}
- qualifyingEvent: loss|move|birth|marriage|none|unknown

Return JSON only:
{
  "state": "FL",
  "currentCoverage": "employer",
  "household": {"spouse": true, "children": 2},
  "qualifyingEvent": "loss"
}

If information is unclear or missing, use null for that field.`

      const extractorResponse = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: extractorPrompt
          }
        ]
      })

      const extractorText = extractorResponse.content[0].type === 'text' ? extractorResponse.content[0].text : '{}'

      try {
        extractedSlots = JSON.parse(extractorText)
      } catch (parseError) {
        console.warn('Failed to parse extracted slots, using defaults')
        extractedSlots = {}
      }
    }

    console.log('📋 Coverage slots:', extractedSlots)

    // Determine marketplace type based on state
    const marketplaceType = getMarketplaceType(extractedSlots.state)

    // Generate coverage decision with LLM
    const decisionPrompt = `You are an expert health insurance navigator. Analyze this coverage situation and provide definitive guidance.

Current situation:
- State: ${extractedSlots.state || 'Unknown'}
- Current coverage: ${extractedSlots.currentCoverage || 'Unknown'}
- Household: ${JSON.stringify(extractedSlots.household) || 'Unknown'}
- Qualifying event: ${extractedSlots.qualifyingEvent || 'Unknown'}
- Marketplace type: ${marketplaceType}

Provide coverage decision guidance in this JSON format:
{
  "summary": "One sentence summary of their situation and best option",
  "options_now": [
    {
      "option": "Stay with employer",
      "eligible": true,
      "timing": "Open enrollment Oct 15 - Dec 7",
      "pros": ["Lower premiums", "Employer contribution"],
      "cons": ["Limited network"]
    }
  ],
  "timing": {
    "open_enrollment": "Oct 15 - Dec 7, 2024",
    "sep_eligible": true,
    "sep_reason": "Loss of coverage",
    "sep_deadline": "60 days from qualifying event"
  },
  "links": [
    {
      "label": "Healthcare.gov",
      "url": "https://www.healthcare.gov",
      "description": "Shop marketplace plans"
    }
  ],
  "scripts": {
    "hr_script": "Hi HR, I'm exploring my options during open enrollment. Can you confirm our plan options, premiums, and if there are any changes for next year? Also, what's the deadline for making changes?",
    "marketplace_script": "I'm looking to compare marketplace plans in [state]. Can you help me understand my options, subsidies I might qualify for, and enrollment deadlines?"
  },
  "citations": [
    {
      "authority": "Federal",
      "title": "ACA Special Enrollment Periods"
    }
  ]
}

Rules:
- Be definitive when critical slots are present
- Include family affordability considerations if household info present
- Account for state-specific marketplace rules
- Scripts should be 110-150 words
- All options should be actionable and current`

    const decisionResponse = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: decisionPrompt
        }
      ]
    })

    const decisionText = decisionResponse.content[0].type === 'text' ? decisionResponse.content[0].text : ''

    let result
    try {
      result = JSON.parse(decisionText)
    } catch (parseError) {
      console.error('Failed to parse decision response:', parseError)
      return NextResponse.json(
        { error: 'Failed to generate coverage decision' },
        { status: 500 }
      )
    }

    // Store session in database
    const { data: sessionData, error: dbError } = await supabaseAdmin
      .from('coverage_sessions')
      .upsert({
        thread_id: threadId,
        state: extractedSlots.state,
        current_coverage: extractedSlots.currentCoverage,
        household: extractedSlots.household,
        qualifying_event: extractedSlots.qualifyingEvent,
        marketplace_type: marketplaceType,
        result: result,
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      // Continue without failing - session storage is optional
    }

    console.log('✅ Coverage Decision Wizard completed')

    return NextResponse.json({
      success: true,
      sessionId: sessionData?.id,
      slots: extractedSlots,
      marketplaceType,
      result,
      threadId
    })

  } catch (error) {
    console.error('❌ Coverage Wizard failed:', error)
    return NextResponse.json(
      {
        error: 'Coverage wizard failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

function getMarketplaceType(state?: string): string {
  if (!state) return 'healthcare.gov'

  // State-based marketplaces (as of 2024)
  const stateBased = [
    'CA', 'CO', 'CT', 'DC', 'ID', 'MA', 'MD', 'MN', 'NV', 'NJ', 'NY', 'PA', 'RI', 'VT', 'WA'
  ]

  return stateBased.includes(state.toUpperCase()) ? 'state-based' : 'healthcare.gov'
}