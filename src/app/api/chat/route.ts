import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { createHash } from 'crypto'

// Response schema for the existing chat UI
interface LegacyChatResponse {
  reassurance_message?: string
  problem_summary?: string
  missing_info?: string[]
  errors_detected: string[]
  step_by_step: string[]
  phone_script?: string
  appeal_letter?: string
  citations: Array<{
    label: string
    reference: string
  }>
  narrative_summary: string
  confidence: number
}

// Entity extraction interface
interface ExtractedEntities {
  state?: string
  plan_type?: 'HMO' | 'PPO' | 'EPO' | 'HDHP' | 'Medicare' | 'Medicaid'
  network_status?: 'in-network' | 'out-of-network' | 'unknown'
  service_type?: string
  dates?: {
    dos?: string
    denial_date?: string
  }
  payer?: string
  facility_vs_professional?: 'facility' | 'professional'
  pharmacy?: boolean
  docs_present?: boolean
}

// One-question enforcement
async function checkOneQuestionLimit(email: string, ip: string): Promise<boolean> {
  const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex')
  const ipHash = createHash('sha256').update(ip).digest('hex')

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: existingRequests } = await supabaseAdmin
    .from('chat_requests')
    .select('id')
    .or(`email_hash.eq.${emailHash},ip_hash.eq.${ipHash}`)
    .gt('created_at', twentyFourHoursAgo)
    .limit(1)

  return !!(existingRequests && existingRequests.length > 0)
}

// Classify user question into themes
async function classifyQuestion(question: string): Promise<{ theme: string, confidence: number }> {
  // Simplified classification - in production this would use ML model with 120-question taxonomy
  const themes = {
    'surprise_billing': ['surprise', 'out of network', 'emergency', 'balance bill', 'no surprises act'],
    'insurance_appeal': ['denied', 'rejection', 'appeal', 'claim denied', 'coverage denied'],
    'billing_error': ['wrong code', 'billing error', 'overcharged', 'duplicate', 'incorrect amount'],
    'preventive_vs_diagnostic': ['preventive', 'screening', 'diagnostic', 'wellness', 'annual'],
    'prior_authorization': ['prior auth', 'preauth', 'authorization', 'approval needed'],
    'cobra_continuation': ['cobra', 'job loss', 'continuation', 'qualifying event'],
    'mue_exceeded': ['units', 'quantity', 'exceeded', 'multiple', 'too many'],
    'timely_filing': ['late', 'filing deadline', 'missed deadline', 'time limit'],
  }

  const questionLower = question.toLowerCase()

  for (const [theme, keywords] of Object.entries(themes)) {
    for (const keyword of keywords) {
      if (questionLower.includes(keyword)) {
        return { theme, confidence: 0.8 }
      }
    }
  }

  return { theme: 'general_billing', confidence: 0.5 }
}

// Extract entities from question text
function extractEntities(question: string, benefits?: any): ExtractedEntities {
  const entities: ExtractedEntities = {}

  // State extraction
  const states = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']

  for (const state of states) {
    if (question.toUpperCase().includes(state)) {
      entities.state = state
      break
    }
  }

  // Payer extraction
  const payers = ['aetna', 'uhc', 'united', 'cigna', 'anthem', 'bcbs', 'blue cross', 'humana', 'kaiser', 'medicare', 'medicaid']
  const questionLower = question.toLowerCase()
  for (const payer of payers) {
    if (questionLower.includes(payer)) {
      entities.payer = payer
      break
    }
  }

  // Plan type extraction
  const planTypes = ['hmo', 'ppo', 'epo', 'hdhp', 'high deductible']
  for (const planType of planTypes) {
    if (questionLower.includes(planType)) {
      entities.plan_type = planType.toUpperCase() as any
      break
    }
  }

  // Network status
  if (questionLower.includes('out of network') || questionLower.includes('oon')) {
    entities.network_status = 'out-of-network'
  } else if (questionLower.includes('in network') || questionLower.includes('in-network')) {
    entities.network_status = 'in-network'
  }

  return entities
}

// Build RAG queries based on classification and entities
function buildRAGQueries(theme: string, entities: ExtractedEntities): string[] {
  const queries = []

  // Federal anchor query
  switch (theme) {
    case 'surprise_billing':
      queries.push('No Surprises Act 45 CFR 149 out-of-network emergency ancillary')
      break
    case 'insurance_appeal':
      queries.push('ERISA 29 CFR 2560.503-1 claims appeals procedures')
      break
    case 'preventive_vs_diagnostic':
      queries.push('ACA preventive services no cost sharing 45 CFR 147.130')
      break
    case 'cobra_continuation':
      queries.push('COBRA continuation coverage 26 USC 4980B qualifying events')
      break
    default:
      queries.push('general healthcare billing regulations federal law')
  }

  // State-specific query
  if (entities.state) {
    queries.push(`${entities.state} state insurance regulations balance billing prompt pay`)
  }

  // Payer policy query
  if (entities.payer) {
    queries.push(`${entities.payer} policy ${theme} coverage determination`)
  }

  // CMS policy query for coding issues
  if (theme === 'mue_exceeded' || theme === 'billing_error') {
    queries.push('CMS NCCI MUE claims processing manual')
  }

  return queries
}

// Mock knowledge retrieval (in production this would use vector search + full-text)
async function retrieveKnowledge(queries: string[]): Promise<any[]> {
  // Mock authoritative sources - in production this would query the knowledge base
  return [
    {
      authority: 'Federal',
      source: '45 CFR 149.410 - Patient protections',
      effective_date: '2022-01-01',
      url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149',
      content: 'No Surprises Act protections for out-of-network emergency services and ancillary services at in-network facilities'
    },
    {
      authority: 'CMS',
      source: 'CMS Claims Processing Manual Chapter 1 Section 30.6',
      effective_date: '2023-01-01',
      content: 'Medicare claims processing requirements and edit procedures'
    }
  ]
}

// Generate response using retrieved knowledge
function generateResponse(
  theme: string,
  entities: ExtractedEntities,
  knowledge: any[],
  question: string,
  benefits?: any
): LegacyChatResponse {
  // Mock response generation - in production this would use LLM with knowledge context
  const response: LegacyChatResponse = {
    reassurance_message: `I understand you're dealing with a ${theme.replace('_', ' ')} situation. This is a common healthcare billing issue, and there are specific steps we can take to help resolve it.`,
    problem_summary: `Based on your question about ${theme.replace('_', ' ')}, this appears to be a healthcare billing issue that involves potential regulatory protections. Your situation may be covered under federal healthcare laws, and the resolution path depends on your insurance plan type, provider network status, and the nature of the services provided.`,
    missing_info: [
      'Specific insurance plan details',
      'Provider network status',
      'Service dates and amounts'
    ],
    errors_detected: [
      'Potential billing discrepancy identified',
      'Insurance processing issue detected'
    ],
    step_by_step: [
      'Contact your insurance company using the phone script below',
      'Request a detailed explanation of benefits (EOB)',
      'Document all interactions with reference numbers',
      'If initial contact doesn\'t resolve the issue, submit a formal appeal',
      'Follow up within 30 days if no response received'
    ],
    phone_script: `Hello, my name is [Your Name] and I'm calling about a billing issue with my claim.

I'm calling about claim #[CLAIM_ID] for services received on [SERVICE_DATE].

Based on my review of applicable healthcare regulations, I believe this claim was processed incorrectly. Specifically, [DESCRIBE THE ISSUE].

I would like to request:
1. A detailed review of this claim
2. A written explanation if the current determination stands
3. Information about the appeals process if applicable

Please provide me with a reference number for this call and let me know when I can expect a response.

Thank you for your assistance.`,
    appeal_letter: `[Date]

[Insurance Company Name]
Claims Review Department
[Address]

RE: Claim Number [CLAIM_ID]
Policy Holder: [Your Name]
Policy Number: [POLICY_NUMBER]

Dear Claims Review Team,

I am writing to formally appeal the denial/processing of claim #[CLAIM_ID] for services rendered on [SERVICE_DATE].

Based on my review of applicable regulations and my plan benefits, I believe this claim should be covered/processed differently for the following reasons:

1. [SPECIFIC REASON BASED ON COVERAGE]
2. [REGULATORY CITATION IF APPLICABLE]
3. [ADDITIONAL SUPPORTING INFORMATION]

I request that you reconsider this claim and provide a detailed written explanation of your determination, including specific policy provisions and regulatory citations.

Please contact me at [PHONE] or [EMAIL] if you need additional information.

I look forward to your prompt response within the timeframes required by law.

Sincerely,
[Your Signature]
[Your Printed Name]

Enclosures:
- Copy of original claim
- Supporting documentation
- Insurance card copy`,
    citations: knowledge.map(k => ({
      label: k.authority,
      reference: k.source
    })),
    narrative_summary: `Your ${theme.replace('_', ' ')} situation involves important healthcare consumer protections. While each case is unique, federal and state laws provide specific rights and procedures for resolving billing disputes. The key is to follow the proper channels: start with your insurance company, document everything, and escalate through formal appeals if necessary. Remember that you have the right to understand your bills and challenge incorrect charges. The phone script and appeal letter provided will help you communicate effectively with your insurer. If these steps don't resolve the issue, consider contacting your state insurance department for additional assistance.`,
    confidence: 85
  }

  // Customize response based on theme
  if (theme === 'surprise_billing') {
    response.reassurance_message = 'You may be protected by the No Surprises Act, which provides specific protections against surprise billing for emergency services and out-of-network providers at in-network facilities.'
    response.errors_detected.push('Potential surprise billing violation - federal protections may apply')
  }

  if (theme === 'insurance_appeal') {
    response.step_by_step.unshift('Review your plan\'s Summary of Benefits and Coverage (SBC)')
    response.missing_info.push('Copy of the denial letter with specific reason codes')
  }

  return response
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, benefits } = body

    // Validate required fields
    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Get user IP
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'

    // For existing chat UI, we don't enforce one-question limit
    // This allows the existing preview functionality to work

    console.log(`🤖 Processing chat request: ${message.substring(0, 100)}...`)

    // Classify question
    const classification = await classifyQuestion(message)
    console.log(`📊 Classification: ${classification.theme} (${classification.confidence})`)

    // Extract entities
    const entities = extractEntities(message, benefits)
    console.log(`🔍 Entities:`, entities)

    // Build RAG queries
    const ragQueries = buildRAGQueries(classification.theme, entities)
    console.log(`🔍 RAG queries:`, ragQueries)

    // Retrieve knowledge
    const knowledge = await retrieveKnowledge(ragQueries)
    console.log(`📚 Retrieved ${knowledge.length} knowledge sources`)

    // Generate response
    const response = generateResponse(classification.theme, entities, knowledge, message, benefits)

    console.log(`✅ Chat response generated for theme: ${classification.theme}`)

    return NextResponse.json(response, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })

  } catch (error) {
    console.error('❌ Chat API error:', error)

    // Return a fallback response that works with the existing UI
    return NextResponse.json({
      reassurance_message: "I understand you're looking for help with your healthcare billing situation.",
      problem_summary: "I'm experiencing technical difficulties right now, but I can still provide some general guidance.",
      missing_info: ["Please try your request again in a moment"],
      errors_detected: [],
      step_by_step: [
        "Try refreshing the page and submitting your question again",
        "If the issue persists, you can contact your insurance company directly",
        "Consider seeking help from a patient advocate or healthcare navigator"
      ],
      phone_script: null,
      appeal_letter: null,
      citations: [],
      narrative_summary: "I apologize for the technical difficulty. Healthcare billing can be complex and frustrating, but there are always options and people who can help. While I work through this issue, don't hesitate to reach out directly to your insurance company or healthcare provider for immediate assistance.",
      confidence: 30
    }, { status: 200 })
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}