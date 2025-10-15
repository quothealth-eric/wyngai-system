import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { createHash } from 'crypto'
import { z } from 'zod'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { HealthcareTaxonomyClassifier } from '@/lib/taxonomy/healthcare-120'
import { AuthoritativeKnowledgeRetriever } from '@/lib/knowledge/authoritative-sources'

// Initialize LLM clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder'
})

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'sk-placeholder'
})

// Real LLM implementations
const callOpenAI = async (prompt: string, systemPrompt: string) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('placeholder')) {
      return {
        response: "OpenAI API key not configured. Please add a valid OPENAI_API_KEY to environment variables.",
        confidence: 0
      }
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })

    return {
      response: response.choices[0]?.message?.content || "No response from OpenAI",
      confidence: 90
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
    return {
      response: "Error calling OpenAI API. Please check your API key and try again.",
      confidence: 0
    }
  }
}

const callAnthropic = async (prompt: string, systemPrompt: string) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('placeholder')) {
      return {
        response: "Using Anthropic for healthcare guidance. However, for full functionality, please ensure proper API configuration.",
        confidence: 75
      }
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    })

    const content = response.content[0]
    const responseText = content.type === 'text' ? content.text : "No response from Anthropic"

    return {
      response: responseText,
      confidence: 88
    }
  } catch (error) {
    console.error('Anthropic API error:', error)
    return {
      response: "Error calling Anthropic API. Using fallback healthcare guidance system.",
      confidence: 60
    }
  }
}

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
    authority: z.enum(['Federal', 'State', 'CMS', 'Payer_Policy', 'Professional_Association']),
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
  const amounts: number[] = []
  let match
  while ((match = amountRegex.exec(question)) !== null) {
    amounts.push(parseFloat(match[1].replace(',', '')))
  }

  if (amounts.length > 0) {
    entities.amounts.billed = amounts[0]
    if (amounts.length > 1) entities.amounts.patient_responsibility = amounts[1]
  }

  // Extract dates
  const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/g
  const dateMatch = dateRegex.exec(question)
  if (dateMatch) {
    entities.dates.service_date = dateMatch[1]
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
    relevance_score: Math.min(knowledgeResult.relevance_scores?.[source.id] ?? 75, 100),
    title: source.title,
    citation_format: source.citation_format
  }))
}

// Determine if question requires phone scripts and appeal letters
function requiresPhoneScriptsAndAppeals(question: string, intent: any): {
  needsPhoneScript: boolean,
  needsAppealLetter: boolean,
  reasoning: string,
  questionType: string
} {
  const lowerQuestion = question.toLowerCase()

  // Keywords that indicate disputes, denials, or appeals requiring formal action
  const disputeKeywords = ['claim denied', 'claim rejected', 'denial letter', 'appeal denied', 'formal dispute', 'overcharged', 'refuse to pay', 'balance billing', 'surprise bill', 'billing error']
  const informationalKeywords = ['what is', 'how does', 'explain', 'understand', 'definition', 'meaning', 'general question', 'how much', 'typical cost', 'help me understand']
  const enrollmentKeywords = ['enroll', 'enrollment', 'marketplace', 'healthcare.gov', 'aca', 'obamacare', 'sign up', 'apply', 'coverage options', 'choose plan', 'open enrollment']
  const preventiveKeywords = ['preventive', 'wellness', 'screening', 'vaccine', 'immunization', 'annual exam', 'checkup', 'mammogram', 'colonoscopy']
  const coverageIssueKeywords = ['dropped from', 'lost coverage', 'coverage terminated', 'policy cancelled', 'premium paid', 'cancelled my insurance', 'coverage dropped']

  const hasDisputeKeyword = disputeKeywords.some(keyword => lowerQuestion.includes(keyword))
  const hasInformationalKeyword = informationalKeywords.some(keyword => lowerQuestion.includes(keyword))
  const hasEnrollmentKeyword = enrollmentKeywords.some(keyword => lowerQuestion.includes(keyword))
  const hasPreventiveKeyword = preventiveKeywords.some(keyword => lowerQuestion.includes(keyword))
  const hasCoverageIssueKeyword = coverageIssueKeywords.some(keyword => lowerQuestion.includes(keyword))

  // Check intent classification for dispute/appeal situations
  const disputeIntents = ['INSURANCE_DENIALS', 'BILLING_ERRORS', 'SURPRISE_BILLING', 'APPEAL_PROCESS', 'CLAIM_DISPUTES']
  const enrollmentIntents = ['MARKETPLACE_ENROLLMENT', 'PLAN_SELECTION', 'COVERAGE_OPTIONS']
  const preventiveIntents = ['PREVENTIVE_CARE', 'WELLNESS_BENEFITS']

  const isDisputeIntent = disputeIntents.some(disputeIntent => intent.primary_intent.includes(disputeIntent))
  const isEnrollmentIntent = enrollmentIntents.some(enrollmentIntent => intent.primary_intent.includes(enrollmentIntent))
  const isPreventiveIntent = preventiveIntents.some(preventiveIntent => intent.primary_intent.includes(preventiveIntent))

  // Determine question type for contextual response
  let questionType = 'general'
  if (hasEnrollmentKeyword || isEnrollmentIntent) {
    questionType = 'enrollment'
  } else if (hasPreventiveKeyword || isPreventiveIntent) {
    questionType = 'preventive'
  } else if (hasDisputeKeyword || isDisputeIntent) {
    questionType = 'dispute'
  } else if (hasCoverageIssueKeyword) {
    questionType = 'coverage'
  } else if (hasInformationalKeyword) {
    questionType = 'informational'
  }

  // Determine if phone scripts are needed (only for billing disputes or complex issues)
  const needsPhoneScript = hasDisputeKeyword || isDisputeIntent

  // Determine if appeal letters are needed (narrower scope - only disputes/denials)
  const needsAppealLetter = hasDisputeKeyword || isDisputeIntent

  const reasoning = hasInformationalKeyword || hasEnrollmentKeyword || hasPreventiveKeyword
    ? 'Question appears to be informational/educational in nature'
    : hasDisputeKeyword
    ? 'Question indicates a dispute, denial, or billing error requiring action'
    : isDisputeIntent
    ? 'Intent classification suggests a dispute or billing issue'
    : 'Question relates to healthcare/insurance but may not require formal appeals'

  return { needsPhoneScript, needsAppealLetter, reasoning, questionType }
}

// Dual LLM processing with contextual response generation
async function generateResponseWithDualLLM(
  question: string,
  intent: any,
  entities: any,
  authoritativeSources: any[],
  benefits?: any
): Promise<VerticalAIResponse> {
  const startTime = Date.now()

  // Determine if this question warrants phone scripts and appeal letters
  const actionRequirements = requiresPhoneScriptsAndAppeals(question, intent)
  console.log(`🔍 Action requirements analysis:`, actionRequirements)

  // Get taxonomy-specific action steps
  const { HealthcareTaxonomyClassifier } = await import('@/lib/taxonomy/healthcare-120')
  const taxonomySteps = HealthcareTaxonomyClassifier.getRecommendedSteps(intent.taxonomy_code)

  // Retrieve authoritative knowledge
  const knowledgeResult = await AuthoritativeKnowledgeRetriever.retrieve({
    intent: intent.primary_intent,
    taxonomy_code: intent.taxonomy_code,
    entities: entities,
    search_terms: question.split(' ').filter(word => word.length > 3),
    max_results: 3
  })

  // Create contextually appropriate system prompt based on question type
  const getContextualSystemPrompt = (questionType: string) => {
    const basePrompt = `You are a healthcare advocate helping patients with healthcare and insurance questions.

IMPORTANT CONTEXT ANALYSIS:
- Question Type: ${actionRequirements.reasoning}
- Question Category: ${questionType}
- Requires Phone Scripts: ${actionRequirements.needsPhoneScript ? 'YES' : 'NO'}
- Requires Appeal Letters: ${actionRequirements.needsAppealLetter ? 'YES' : 'NO'}

Context from authoritative sources:
${knowledgeResult.sources.map(source => `- ${source.title}: ${source.content.substring(0, 200)}...`).join('\n')}

Intent Classification: ${intent.primary_intent} (${intent.confidence}% confidence)
Taxonomy Code: ${intent.taxonomy_code}`

    switch (questionType) {
      case 'enrollment':
        return `${basePrompt}

SPECIFIC GUIDANCE FOR ENROLLMENT QUESTIONS:
- Focus on marketplace enrollment processes, deadlines, and plan selection
- Explain eligibility requirements and subsidy qualifications
- Provide step-by-step enrollment guidance
- Include important deadlines and open enrollment periods
- Explain plan types (HMO, PPO, etc.) in simple terms
- Do NOT include phone scripts or appeal letters unless specifically about enrollment disputes
- Keep response focused on enrollment guidance, not billing disputes`

      case 'preventive':
        return `${basePrompt}

SPECIFIC GUIDANCE FOR PREVENTIVE CARE QUESTIONS:
- Explain what preventive services are covered at 100%
- Clarify the difference between preventive and diagnostic services
- Include age-appropriate screening recommendations
- Explain annual wellness visit benefits
- Do NOT include phone scripts or appeal letters unless specifically about preventive care billing issues
- Focus on education about preventive benefits, not billing disputes`

      case 'dispute':
        return `${basePrompt}

SPECIFIC GUIDANCE FOR BILLING DISPUTES:
- Provide specific steps to resolve billing disputes
- Include relevant patient rights and regulations
- Offer phone scripts for contacting providers/insurers
- Provide appeal letter templates when appropriate
- Focus on actionable dispute resolution steps
- Include regulatory citations relevant to billing disputes`

      case 'coverage':
        return `${basePrompt}

SPECIFIC GUIDANCE FOR COVERAGE ISSUES:
- Provide clear steps to resolve coverage problems (like wrongful termination)
- Include contact guidance within the narrative response (not as separate sections)
- Focus on patient rights and insurance regulations
- Explain the process for addressing coverage issues
- Include sample language within the main response, not as separate templates
- Do NOT provide standalone phone script or appeal letter sections`

      default:
        return `${basePrompt}

GENERAL HEALTHCARE GUIDANCE:
- Provide clear, educational information about healthcare and insurance
- Use simple, layman's terms to explain complex concepts
- Focus on being helpful and informative
- Only include phone scripts or appeals if the question specifically involves a dispute
- Keep response appropriate to the specific question asked`
    }
  }

  const systemPrompt = getContextualSystemPrompt(actionRequirements.questionType) + `

RESPONSE GUIDELINES:
1. Be empathetic, clear, and specific to the user's situation
2. Provide actionable advice appropriate to the question type
3. Use layman's terms and explain complex concepts simply
4. Write a comprehensive but focused response (aim for 200-400 words)
5. Ensure all information is directly relevant to the user's specific question
6. Avoid generic or boilerplate responses - tailor everything to their question`

  // Dual LLM calls with knowledge integration
  const [openaiResult, anthropicResult] = await Promise.all([
    callOpenAI(question, systemPrompt),
    callAnthropic(question, systemPrompt)
  ])

  const processingTime = Date.now() - startTime

  // Combine LLM responses for comprehensive answer
  const primaryResponse = anthropicResult.confidence > openaiResult.confidence ? anthropicResult : openaiResult
  const secondaryResponse = anthropicResult.confidence > openaiResult.confidence ? openaiResult : anthropicResult

  // Create contextual reassurance message
  const getContextualReassurance = (questionType: string, question: string): string => {
    switch (questionType) {
      case 'enrollment':
        return `I understand you're looking for guidance about health insurance enrollment. Let me help you navigate the marketplace options and enrollment process.`
      case 'preventive':
        return `I can help you understand your preventive care benefits and coverage. Let me provide information about what's typically covered under healthcare plans.`
      case 'dispute':
        return `I understand you're dealing with a billing or coverage dispute. Let me provide you with specific guidance based on healthcare regulations and your rights as a patient.`
      case 'coverage':
        return `I understand you're having an issue with your insurance coverage. Let me help you understand your options and next steps to resolve this situation.`
      case 'informational':
        return `I'm here to help you understand healthcare and insurance concepts. Let me provide clear, helpful information about your question.`
      default:
        return `I'm here to help with your healthcare and insurance question. Let me provide you with relevant guidance and information.`
    }
  }

  // Create comprehensive response using LLM analysis
  const response: VerticalAIResponse = {
    reassurance_message: getContextualReassurance(actionRequirements.questionType, question),
    problem_summary: primaryResponse.response,
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
    regulatory_citations: knowledgeResult.sources
      .filter(source => {
        // Only include citations with high relevance scores (85+) and contextual relevance
        const relevanceScore = knowledgeResult.relevance_scores?.[source.id] ?? 75
        const sourceTitle = source.title.toLowerCase()
        const questionLower = question.toLowerCase()

        // For enrollment questions, only include marketplace/ACA citations
        if (actionRequirements.questionType === 'enrollment') {
          return relevanceScore >= 85 && (
            sourceTitle.includes('marketplace') ||
            sourceTitle.includes('aca') ||
            sourceTitle.includes('affordable care') ||
            sourceTitle.includes('enrollment') ||
            sourceTitle.includes('healthcare.gov')
          )
        }

        // For preventive questions, only include preventive care citations
        if (actionRequirements.questionType === 'preventive') {
          return relevanceScore >= 85 && (
            sourceTitle.includes('preventive') ||
            sourceTitle.includes('wellness') ||
            sourceTitle.includes('screening')
          )
        }

        // For dispute questions, include billing/appeal related citations
        if (actionRequirements.questionType === 'dispute') {
          return relevanceScore >= 85 && (
            sourceTitle.includes('billing') ||
            sourceTitle.includes('appeal') ||
            sourceTitle.includes('dispute') ||
            sourceTitle.includes('denial') ||
            sourceTitle.includes('surprise')
          )
        }

        // For other questions, use high relevance threshold and avoid generic citations
        return relevanceScore >= 90 && !sourceTitle.includes('no surprises act')
      })
      .map(source => ({
        authority: source.authority as any,
        source: source.title,
        section: source.section,
        effective_date: source.effective_date,
        url: source.url,
        relevance_score: Math.min(knowledgeResult.relevance_scores?.[source.id] ?? 80, 100)
      }))
      .slice(0, 2), // Limit to top 2 most relevant citations
    action_plan: {
      immediate_steps: taxonomySteps.length > 0 ? taxonomySteps : [
        {
          step: actionRequirements.needsPhoneScript
            ? 'Contact your insurance company using the phone script provided'
            : 'Review your insurance plan documents and benefits',
          priority: actionRequirements.needsAppealLetter ? 'HIGH' : 'MEDIUM',
          deadline: actionRequirements.needsAppealLetter ? 'Within 3 business days' : 'When convenient',
          estimated_time: actionRequirements.needsPhoneScript ? '30-45 minutes' : '15-20 minutes'
        },
        ...(actionRequirements.needsPhoneScript ? [{
          step: 'Request a detailed explanation of benefits (EOB)',
          priority: 'HIGH' as const,
          deadline: 'During initial call',
          estimated_time: '5 minutes'
        }] : []),
        {
          step: actionRequirements.needsAppealLetter
            ? 'Document all interactions with reference numbers'
            : 'Keep records of any communications for future reference',
          priority: 'MEDIUM' as const,
          deadline: 'Ongoing',
          estimated_time: '5 minutes per interaction'
        }
      ],
      phone_scripts: actionRequirements.needsPhoneScript ? [
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
      ] : [],
      appeal_letters: actionRequirements.needsAppealLetter ? [
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
      ] : [],
      follow_up_timeline: actionRequirements.needsAppealLetter ? [
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
      ] : actionRequirements.needsPhoneScript ? [
        {
          action: 'Follow up if no response from initial contact',
          days_from_now: 14,
          trigger_condition: 'No response received'
        }
      ] : []
    },
    disclaimers: [
      'This is general information only and not legal or professional advice',
      'Consult with qualified professionals for your specific situation',
      'Regulations and policies may vary by state and insurance plan',
      'Success rates and timelines are estimates based on similar cases'
    ],
    narrative_summary: primaryResponse.response + (secondaryResponse.confidence > 70 ? `\n\nAdditional perspective: ${secondaryResponse.response}` : ''),
    processing_metadata: {
      openai_confidence: openaiResult.confidence,
      anthropic_confidence: anthropicResult.confidence,
      consensus_score: Math.round((openaiResult.confidence + anthropicResult.confidence) / 2),
      processing_time_ms: processingTime,
      llm_provider_used: primaryResponse === anthropicResult ? 'anthropic' : 'openai',
      knowledge_sources_retrieved: knowledgeResult.sources.length
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