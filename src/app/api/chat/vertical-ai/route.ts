import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { createHash } from 'crypto'
import { z } from 'zod'

// Mock LLM clients for now - will be replaced with actual implementations
const mockOpenAICall = async (prompt: string) => ({
  response: "OpenAI mock response",
  confidence: 85
})

const mockAnthropicCall = async (prompt: string) => ({
  response: "Anthropic mock response",
  confidence: 82
})

// Rate limiting store
const rateLimitStore = new Map<string, number[]>()
const RATE_LIMIT_WINDOW = 60000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5

// Enhanced response schema for Vertical-AI pattern
const VerticalAIResponseSchema = z.object({
  reassurance_message: z.string().optional(),
  problem_summary: z.string().optional(),
  confidence_level: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  intent_classification: z.object({
    primary_intent: z.string(),
    confidence: z.number().min(0).max(100),
    taxonomy_code: z.string(),
    sub_categories: z.array(z.string())
  }),
  extracted_entities: z.object({
    state: z.string().optional(),
    plan_type: z.enum(['HMO', 'PPO', 'EPO', 'HDHP', 'Medicare', 'Medicaid']).optional(),
    network_status: z.enum(['in-network', 'out-of-network', 'unknown']).optional(),
    service_type: z.string().optional(),
    payer: z.string().optional(),
    amounts: z.object({
      billed: z.number().optional(),
      allowed: z.number().optional(),
      patient_responsibility: z.number().optional()
    }).optional(),
    dates: z.object({
      service_date: z.string().optional(),
      denial_date: z.string().optional(),
      appeal_deadline: z.string().optional()
    }).optional()
  }),
  errors_detected: z.array(z.object({
    error_type: z.string(),
    severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    description: z.string(),
    regulatory_basis: z.string().optional()
  })),
  regulatory_citations: z.array(z.object({
    authority: z.enum(['Federal', 'State', 'CMS', 'Payer_Policy']),
    source: z.string(),
    section: z.string().optional(),
    effective_date: z.string().optional(),
    url: z.string().optional(),
    relevance_score: z.number().min(0).max(100)
  })),
  action_plan: z.object({
    immediate_steps: z.array(z.object({
      step: z.string(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      deadline: z.string().optional(),
      estimated_time: z.string().optional()
    })),
    phone_scripts: z.array(z.object({
      title: z.string(),
      scenario: z.string(),
      script: z.string(),
      expected_outcome: z.string().optional()
    })),
    appeal_letters: z.array(z.object({
      title: z.string(),
      template: z.string(),
      required_attachments: z.array(z.string()),
      submission_deadline: z.string().optional()
    })),
    follow_up_timeline: z.array(z.object({
      action: z.string(),
      days_from_now: z.number(),
      trigger_condition: z.string().optional()
    }))
  }),
  cost_estimates: z.object({
    current_exposure: z.number().optional(),
    potential_savings: z.number().optional(),
    success_probability: z.number().min(0).max(100).optional(),
    estimated_resolution_time: z.string().optional()
  }).optional(),
  disclaimers: z.array(z.string()),
  narrative_summary: z.string(),
  processing_metadata: z.object({
    openai_confidence: z.number().min(0).max(100),
    anthropic_confidence: z.number().min(0).max(100),
    consensus_score: z.number().min(0).max(100),
    processing_time_ms: z.number(),
    llm_provider_used: z.enum(['openai', 'anthropic', 'consensus']),
    knowledge_sources_retrieved: z.number()
  })
})

type VerticalAIResponse = z.infer<typeof VerticalAIResponseSchema>

// 120-question taxonomy classification (partial implementation)
const HEALTHCARE_TAXONOMY = {
  'BILLING_ERRORS': {
    'B001': 'Incorrect procedure codes',
    'B002': 'Duplicate billing',
    'B003': 'Upcoding/downcoding',
    'B004': 'Unbundling',
    'B005': 'Date of service errors'
  },
  'INSURANCE_DENIALS': {
    'I001': 'Prior authorization required',
    'I002': 'Not medically necessary',
    'I003': 'Experimental/investigational',
    'I004': 'Out-of-network provider',
    'I005': 'Benefit exclusion'
  },
  'SURPRISE_BILLING': {
    'S001': 'Emergency services',
    'S002': 'Ancillary services at in-network facility',
    'S003': 'Out-of-network assistant surgeon',
    'S004': 'Ground ambulance',
    'S005': 'Air ambulance'
  },
  'PREVENTIVE_CARE': {
    'P001': 'Annual wellness visit miscoded',
    'P002': 'Screening vs diagnostic confusion',
    'P003': 'Contraceptive coverage',
    'P004': 'Immunization coverage',
    'P005': 'Mammography/colonoscopy'
  }
}

// Rate limiting function
function checkRateLimit(identifier: string): boolean {
  const now = Date.now()
  const userRequests = rateLimitStore.get(identifier) || []

  // Remove old requests outside the window
  const validRequests = userRequests.filter(timestamp =>
    now - timestamp < RATE_LIMIT_WINDOW
  )

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false
  }

  validRequests.push(now)
  rateLimitStore.set(identifier, validRequests)
  return true
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

// Intent classification using 120-question taxonomy
async function classifyIntentWithTaxonomy(question: string): Promise<{
  primary_intent: string,
  confidence: number,
  taxonomy_code: string,
  sub_categories: string[]
}> {
  // Import the advanced taxonomy classifier
  const { HealthcareTaxonomyClassifier } = await import('@/lib/taxonomy/healthcare-120')

  // Use the comprehensive 120-question taxonomy system
  const classification = HealthcareTaxonomyClassifier.classify(question)

  console.log(`🏷️  Advanced taxonomy classification:`, {
    code: classification.taxonomy_code,
    intent: classification.primary_intent,
    confidence: classification.confidence,
    all_matches: classification.all_matches.length
  })

  return {
    primary_intent: classification.primary_intent,
    confidence: classification.confidence,
    taxonomy_code: classification.taxonomy_code,
    sub_categories: classification.sub_categories
  }
}

// Enhanced entity extraction
function extractEntitiesAdvanced(question: string, benefits?: any) {
  const entities: any = {
    amounts: {},
    dates: {}
  }

  // Extract dollar amounts
  const amountRegex = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g
  const amounts = [...question.matchAll(amountRegex)].map(match => parseFloat(match[1].replace(',', '')))

  if (amounts.length > 0) {
    entities.amounts.billed = amounts[0]
    if (amounts.length > 1) entities.amounts.patient_responsibility = amounts[1]
  }

  // Extract dates
  const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/g
  const dates = [...question.matchAll(dateRegex)]
  if (dates.length > 0) {
    entities.dates.service_date = dates[0][1]
  }

  // State extraction
  const stateRegex = /\b([A-Z]{2})\b/
  const stateMatch = question.match(stateRegex)
  if (stateMatch) {
    entities.state = stateMatch[1]
  }

  // Payer extraction
  const payerRegex = /\b(aetna|uhc|united|cigna|anthem|blue cross|bcbs|humana|kaiser|medicare|medicaid)\b/i
  const payerMatch = question.match(payerRegex)
  if (payerMatch) {
    entities.payer = payerMatch[1]
  }

  // Plan type extraction
  const planTypeRegex = /\b(hmo|ppo|epo|hdhp|high deductible)\b/i
  const planMatch = question.match(planTypeRegex)
  if (planMatch) {
    entities.plan_type = planMatch[1].toUpperCase()
  }

  // Network status
  if (/out.?of.?network|oon/i.test(question)) {
    entities.network_status = 'out-of-network'
  } else if (/in.?network/i.test(question)) {
    entities.network_status = 'in-network'
  }

  return entities
}

// Retrieve authoritative sources using comprehensive knowledge base
async function retrieveAuthoritativeSources(
  intent: string,
  entities: any,
  taxonomyCode: string
): Promise<any[]> {
  const { AuthoritativeKnowledgeRetriever } = await import('@/lib/knowledge/authoritative-sources')

  // Build search terms from entities
  const searchTerms = [
    intent.toLowerCase().replace('_', ' '),
    ...(entities.payer ? [entities.payer] : []),
    ...(entities.plan_type ? [entities.plan_type] : []),
    ...(entities.service_type ? [entities.service_type] : [])
  ]

  // Retrieve using comprehensive knowledge system
  const knowledgeResult = await AuthoritativeKnowledgeRetriever.retrieve({
    intent,
    taxonomy_code: taxonomyCode,
    entities: {
      state: entities.state,
      payer: entities.payer,
      plan_type: entities.plan_type,
      service_type: entities.service_type
    },
    search_terms: searchTerms,
    max_results: 8
  })

  console.log(`📚 Knowledge retrieval completed:`, {
    sources_found: knowledgeResult.total_found,
    search_time: knowledgeResult.search_time_ms,
    top_authorities: knowledgeResult.sources.slice(0, 3).map(s => s.authority)
  })

  // Transform to match expected format
  return knowledgeResult.sources.map(source => ({
    authority: source.authority,
    source: source.source,
    section: source.section,
    effective_date: source.effective_date,
    url: source.url,
    content: source.content,
    relevance_score: knowledgeResult.relevance_scores[source.id] || 0,
    title: source.title,
    citation_format: source.citation_format
  }))
}

// Dual LLM processing with consensus (mock implementation)
async function generateResponseWithDualLLM(
  question: string,
  intent: any,
  entities: any,
  authoritativeSources: any[],
  benefits?: any
): Promise<VerticalAIResponse> {
  const startTime = Date.now()

  // Get taxonomy-specific action steps
  const { HealthcareTaxonomyClassifier } = await import('@/lib/taxonomy/healthcare-120')
  const taxonomySteps = HealthcareTaxonomyClassifier.getRecommendedSteps(intent.taxonomy_code)

  // Mock dual LLM calls
  const [openaiResult, anthropicResult] = await Promise.all([
    mockOpenAICall(`Analyze: ${question}`),
    mockAnthropicCall(`Analyze: ${question}`)
  ])

  const processingTime = Date.now() - startTime

  // Create comprehensive response
  const response: VerticalAIResponse = {
    reassurance_message: `I understand you're dealing with a ${intent.primary_intent.toLowerCase().replace('_', ' ')} situation. This is a common healthcare billing issue, and there are specific steps we can take to help resolve it.`,
    problem_summary: `Based on your question about ${intent.primary_intent.toLowerCase().replace('_', ' ')}, this appears to be a healthcare billing issue that involves potential regulatory protections. Your situation may be covered under federal healthcare laws.`,
    confidence_level: 'MEDIUM',
    intent_classification: intent,
    extracted_entities: entities,
    errors_detected: [
      {
        error_type: 'POTENTIAL_BILLING_DISCREPANCY',
        severity: 'MEDIUM',
        description: 'Potential billing discrepancy identified based on the described situation',
        regulatory_basis: 'Healthcare billing regulations may apply'
      }
    ],
    regulatory_citations: authoritativeSources.map(source => ({
      authority: source.authority as any,
      source: source.source,
      section: source.section,
      effective_date: source.effective_date,
      url: source.url,
      relevance_score: source.relevance_score
    })),
    action_plan: {
      immediate_steps: taxonomySteps.length > 0 ? taxonomySteps : [
        {
          step: 'Contact your insurance company using the phone script provided',
          priority: 'HIGH',
          deadline: 'Within 3 business days',
          estimated_time: '30-45 minutes'
        },
        {
          step: 'Request a detailed explanation of benefits (EOB)',
          priority: 'HIGH',
          deadline: 'During initial call',
          estimated_time: '5 minutes'
        },
        {
          step: 'Document all interactions with reference numbers',
          priority: 'MEDIUM',
          deadline: 'Ongoing',
          estimated_time: '5 minutes per interaction'
        }
      ],
      phone_scripts: [
        {
          title: 'Initial Insurance Company Contact',
          scenario: 'Calling to inquire about billing discrepancy',
          script: `Hello, my name is [Your Name] and I'm calling about a billing issue with my claim.

I'm calling about claim #[CLAIM_ID] for services received on [SERVICE_DATE].

Based on my review of applicable healthcare regulations, I believe this claim was processed incorrectly. Specifically, [DESCRIBE THE ISSUE].

I would like to request:
1. A detailed review of this claim
2. A written explanation if the current determination stands
3. Information about the appeals process if applicable

Please provide me with a reference number for this call and let me know when I can expect a response.

Thank you for your assistance.`,
          expected_outcome: 'Reference number and timeline for review'
        }
      ],
      appeal_letters: [
        {
          title: 'Formal Claim Appeal Letter',
          template: `[Date]

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
          required_attachments: ['Original claim copy', 'Supporting documentation', 'Insurance card copy'],
          submission_deadline: 'Within 180 days of initial denial'
        }
      ],
      follow_up_timeline: [
        {
          action: 'Follow up if no response from initial contact',
          days_from_now: 14,
          trigger_condition: 'No response received'
        },
        {
          action: 'Escalate to state insurance department if needed',
          days_from_now: 45,
          trigger_condition: 'Appeal denied or no resolution'
        }
      ]
    },
    cost_estimates: {
      current_exposure: entities.amounts?.patient_responsibility || 500,
      potential_savings: entities.amounts?.patient_responsibility ? Math.round(entities.amounts.patient_responsibility * 0.7) : 350,
      success_probability: 75,
      estimated_resolution_time: '30-60 days'
    },
    disclaimers: [
      'This is general information only and not legal or professional advice',
      'Consult with qualified professionals for your specific situation',
      'Regulations and policies may vary by state and insurance plan',
      'Success rates and timelines are estimates based on similar cases'
    ],
    narrative_summary: `Your ${intent.primary_intent.toLowerCase().replace('_', ' ')} situation involves important healthcare consumer protections. While each case is unique, federal and state laws provide specific rights and procedures for resolving billing disputes. The key is to follow the proper channels: start with your insurance company, document everything, and escalate through formal appeals if necessary. Remember that you have the right to understand your bills and challenge incorrect charges. The phone script and appeal letter provided will help you communicate effectively with your insurer. If these steps don't resolve the issue, consider contacting your state insurance department for additional assistance.`,
    processing_metadata: {
      openai_confidence: openaiResult.confidence,
      anthropic_confidence: anthropicResult.confidence,
      consensus_score: Math.round((openaiResult.confidence + anthropicResult.confidence) / 2),
      processing_time_ms: processingTime,
      llm_provider_used: 'consensus',
      knowledge_sources_retrieved: authoritativeSources.length
    }
  }

  return response
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { message, benefits, email } = body

    // Validate required fields
    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required for vertical-ai chat' },
        { status: 400 }
      )
    }

    // Get user IP and create identifier
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'
    const identifier = createHash('sha256').update(`${email}:${ip}`).digest('hex')

    // Rate limiting
    if (!checkRateLimit(identifier)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before making another request.' },
        { status: 429 }
      )
    }

    // One-question limit enforcement
    const hasAskedQuestion = await checkOneQuestionLimit(email, ip)
    if (hasAskedQuestion) {
      return NextResponse.json(
        { error: 'You have already used your free question. Please visit our main website for full access.' },
        { status: 403 }
      )
    }

    console.log(`🤖 Vertical-AI chat request: ${message.substring(0, 100)}...`)

    // Step 1: Intent classification using 120-question taxonomy
    const intentClassification = await classifyIntentWithTaxonomy(message)
    console.log(`📊 Intent classified: ${intentClassification.primary_intent} (${intentClassification.confidence}%)`)

    // Step 2: Enhanced entity extraction
    const extractedEntities = extractEntitiesAdvanced(message, benefits)
    console.log(`🔍 Entities extracted:`, extractedEntities)

    // Step 3: Retrieve authoritative sources
    const authoritativeSources = await retrieveAuthoritativeSources(
      intentClassification.primary_intent,
      extractedEntities,
      intentClassification.taxonomy_code
    )
    console.log(`📚 Retrieved ${authoritativeSources.length} authoritative sources`)

    // Step 4: Dual LLM processing with consensus
    const response = await generateResponseWithDualLLM(
      message,
      intentClassification,
      extractedEntities,
      authoritativeSources,
      benefits
    )

    // Step 5: Schema validation
    const validatedResponse = VerticalAIResponseSchema.parse(response)

    // Step 6: Log the request
    const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex')
    const ipHash = createHash('sha256').update(ip).digest('hex')

    await supabaseAdmin
      .from('chat_requests')
      .insert({
        email_hash: emailHash,
        ip_hash: ipHash,
        question_hash: createHash('sha256').update(message).digest('hex'),
        intent_classification: intentClassification.primary_intent,
        taxonomy_code: intentClassification.taxonomy_code,
        processing_time_ms: Date.now() - startTime,
        created_at: new Date().toISOString()
      })

    console.log(`✅ Vertical-AI chat response generated in ${Date.now() - startTime}ms`)

    return NextResponse.json(validatedResponse, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })

  } catch (error) {
    console.error('❌ Vertical-AI chat API error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Response validation failed', details: error.errors },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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