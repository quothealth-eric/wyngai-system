import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { createHash } from 'crypto'

// Response schema for Wyng Lite AI Chat v2
interface ChatResponse {
  version: string
  theme: string
  plain_english_explanation: string
  key_assumptions: string[]
  citations: Array<{
    authority: 'Federal' | 'CMS' | 'StateDOI' | 'PayerPolicy'
    source: string
    effective_date: string
    url?: string
  }>
  phone_scripts: Array<{
    who: 'Insurer' | 'Provider' | 'State DOI' | 'Facility Billing'
    goal: string
    script_lines: string[]
  }>
  appeal: {
    recommended: boolean
    letter_title?: string
    letter_body?: string
  }
  checklist: string[]
  summary: string[]
  disclaimer: string
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
function extractEntities(question: string, stateHint?: string, payerHint?: string): ExtractedEntities {
  const entities: ExtractedEntities = {}

  // State extraction
  const states = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']

  if (stateHint) {
    entities.state = stateHint
  } else {
    for (const state of states) {
      if (question.toUpperCase().includes(state)) {
        entities.state = state
        break
      }
    }
  }

  // Payer extraction
  if (payerHint) {
    entities.payer = payerHint
  } else {
    const payers = ['aetna', 'uhc', 'united', 'cigna', 'anthem', 'bcbs', 'blue cross', 'humana', 'kaiser', 'medicare', 'medicaid']
    const questionLower = question.toLowerCase()
    for (const payer of payers) {
      if (questionLower.includes(payer)) {
        entities.payer = payer
        break
      }
    }
  }

  // Plan type extraction
  const planTypes = ['hmo', 'ppo', 'epo', 'hdhp', 'high deductible']
  const questionLower = question.toLowerCase()
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
  ocrFacts?: any
): ChatResponse {
  // Mock response generation - in production this would use LLM with knowledge context
  const response: ChatResponse = {
    version: '1.0',
    theme: theme,
    plain_english_explanation: `Based on your question about ${theme.replace('_', ' ')}, this appears to be a common healthcare billing issue. Your situation involves potential regulatory protections under federal healthcare laws. The specific resolution path depends on your insurance plan type, the provider's network status, and the nature of the service provided. Understanding these factors will help determine the best approach for resolving your billing concern.`,
    key_assumptions: [
      'Assuming commercial insurance coverage',
      'Assuming services were medically necessary',
      'Need to confirm exact plan terms and network status'
    ],
    citations: knowledge.map(k => ({
      authority: k.authority as any,
      source: k.source,
      effective_date: k.effective_date,
      url: k.url
    })),
    phone_scripts: [
      {
        who: 'Insurer',
        goal: 'Request claim review and correction',
        script_lines: [
          'Hello, my name is [Your Name] and I\'m calling about a billing issue.',
          `I\'m calling about claim #[CLAIM_ID], service date [DATE].`,
          'Based on federal regulations, I believe this claim was processed incorrectly.',
          'Please review this claim and provide me with a reference number for this call.',
          'When can I expect a response on this review?'
        ]
      }
    ],
    appeal: {
      recommended: true,
      letter_title: 'Formal Appeal for Claim Reconsideration',
      letter_body: 'I am writing to formally appeal the denial/processing of claim #[CLAIM_ID] for services rendered on [DATE]. Based on my review of applicable regulations and my plan benefits, I believe this claim should be covered/processed differently. Please reconsider this claim and provide a detailed explanation of the determination.'
    },
    checklist: [
      'Gather all documentation: EOB, original bill, insurance card, plan documents',
      'Call your insurance company using the script provided',
      'Document all interactions with reference numbers and representative names',
      'If initial call doesn\'t resolve, submit written appeal within 30 days',
      'Contact your state insurance department if needed for additional support'
    ],
    summary: [
      '• Contact insurer first using provided phone script',
      '• Submit formal appeal with supporting documentation if needed',
      '• Escalate to state insurance department if insurer is unresponsive'
    ],
    disclaimer: 'Educational information, not legal advice; verify plan documents and state rules.'
  }

  return response
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, question, state_hint, payer_hint, file } = body

    // Validate required fields
    if (!email || !question) {
      return NextResponse.json(
        { error: 'Email and question are required' },
        { status: 400 }
      )
    }

    // Get user IP
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'

    // Check one-question limit
    const hasExceededLimit = await checkOneQuestionLimit(email, ip)
    if (hasExceededLimit) {
      return NextResponse.json({
        error: 'rate_limited',
        message: 'Wyng Lite answers one detailed question free. For more help, join the waitlist for Wyng MVP.',
        waitlist_url: 'https://www.mywyng.co'
      }, { status: 429 })
    }

    console.log(`🤖 Processing chat request: ${question.substring(0, 100)}...`)

    // Classify question
    const classification = await classifyQuestion(question)
    console.log(`📊 Classification: ${classification.theme} (${classification.confidence})`)

    // Extract entities
    const entities = extractEntities(question, state_hint, payer_hint)
    console.log(`🔍 Entities:`, entities)

    // Build RAG queries
    const ragQueries = buildRAGQueries(classification.theme, entities)
    console.log(`🔍 RAG queries:`, ragQueries)

    // Retrieve knowledge
    const knowledge = await retrieveKnowledge(ragQueries)
    console.log(`📚 Retrieved ${knowledge.length} knowledge sources`)

    // Process OCR if file provided
    let ocrFacts = null
    if (file) {
      console.log(`📄 OCR processing would happen here for file`)
      // OCR processing would be implemented here using Google Cloud Vision
    }

    // Generate response
    const response = generateResponse(classification.theme, entities, knowledge, question, ocrFacts)

    // Log request for audit
    const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex')
    const ipHash = createHash('sha256').update(ip).digest('hex')

    await supabaseAdmin
      .from('chat_requests')
      .insert({
        email_hash: emailHash,
        ip_hash: ipHash,
        theme: classification.theme,
        question_length: question.length,
        has_file: !!file,
        sources_used: knowledge.map(k => k.source),
        created_at: new Date().toISOString()
      })

    console.log(`✅ Chat response generated for theme: ${classification.theme}`)

    return NextResponse.json(response, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })

  } catch (error) {
    console.error('❌ Chat API error:', error)
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