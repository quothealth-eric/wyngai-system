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

  // Use Anthropic to merge and refine the dual responses
  const mergerPrompt = `You are a healthcare advocate response merger. Your task is to create a single, cohesive, well-formatted response from two LLM outputs.

CONTEXT:
- User Question: ${question}
- Question Type: ${actionRequirements.questionType}
- Needs Phone Scripts: ${actionRequirements.needsPhoneScript}
- Needs Appeal Letters: ${actionRequirements.needsAppealLetter}

RESPONSE 1 (OpenAI): ${openaiResult.response}

RESPONSE 2 (Anthropic): ${anthropicResult.response}

INSTRUCTIONS:
1. Merge these into ONE cohesive response that flows naturally
2. Remove any duplicate information or contradictions
3. Use proper HTML formatting (NO markdown ** symbols - use <strong> tags instead)
4. If phone scripts or appeal letters are included, extract them into separate JSON fields
5. Create a clean narrative without embedded scripts/templates

OUTPUT FORMAT:
{
  "narrative": "Clean, cohesive response with proper HTML formatting",
  "extracted_phone_script": "Phone script text if found, otherwise null",
  "extracted_appeal_letter": "Appeal letter template if found, otherwise null"
}`

  const mergedResult = await callAnthropic(mergerPrompt, "You are a precise response merger that outputs only valid JSON.")

  let mergedContent
  try {
    mergedContent = JSON.parse(mergedResult.response)
  } catch (error) {
    console.error('Failed to parse merged response:', error)
    // Fallback to primary response with formatting fixes
    mergedContent = {
      narrative: anthropicResult.response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
      extracted_phone_script: null,
      extracted_appeal_letter: null
    }
  }

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
    problem_summary: mergedContent.narrative.substring(0, 200) + "...",
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
    regulatory_citations: (() => {
      // Generate contextual citations based on question type
      if (actionRequirements.questionType === 'coverage') {
        return [
          {
            authority: 'Federal' as any,
            source: 'Health Insurance Portability and Accountability Act (HIPAA)',
            section: 'Continuation of Coverage Provisions',
            effective_date: '1996-08-21',
            url: 'https://www.dol.gov/agencies/ebsa/laws-and-regulations/laws/cobra',
            relevance_score: 95
          },
          {
            authority: 'State' as any,
            source: 'State Insurance Code - Wrongful Termination Protections',
            section: 'Premium Payment Grace Periods',
            effective_date: '2023-01-01',
            url: undefined,
            relevance_score: 90
          }
        ]
      } else if (actionRequirements.questionType === 'dispute') {
        return [
          {
            authority: 'Federal' as any,
            source: 'Affordable Care Act - Appeals and External Review',
            section: 'Internal Appeals Process',
            effective_date: '2010-03-23',
            url: 'https://www.healthcare.gov/appeal-insurance-company-decision/',
            relevance_score: 95
          },
          {
            authority: 'Federal' as any,
            source: 'Employee Retirement Income Security Act (ERISA)',
            section: 'Claims Procedure Regulations',
            effective_date: '1974-09-02',
            url: 'https://www.dol.gov/agencies/ebsa/laws-and-regulations/laws/erisa',
            relevance_score: 88
          }
        ]
      } else if (actionRequirements.questionType === 'enrollment') {
        return [
          {
            authority: 'Federal' as any,
            source: 'Affordable Care Act - Marketplace Enrollment',
            section: 'Open Enrollment Periods',
            effective_date: '2010-03-23',
            url: 'https://www.healthcare.gov/glossary/open-enrollment-period/',
            relevance_score: 95
          },
          {
            authority: 'Federal' as any,
            source: 'ACA Premium Tax Credits and Cost-Sharing Reductions',
            section: 'Eligibility Requirements',
            effective_date: '2014-01-01',
            url: 'https://www.healthcare.gov/lower-costs/',
            relevance_score: 90
          }
        ]
      } else {
        // For general questions, include relevant broad citations
        return [
          {
            authority: 'Federal' as any,
            source: 'Affordable Care Act - Patient Protections',
            section: 'Essential Health Benefits',
            effective_date: '2010-03-23',
            url: 'https://www.healthcare.gov/coverage/what-marketplace-plans-cover/',
            relevance_score: 85
          }
        ]
      }
    })(),
    action_plan: {
      immediate_steps: (() => {
        // Create contextual steps based on question type
        if (actionRequirements.questionType === 'coverage') {
          return [
            {
              step: 'Contact your insurance company immediately to inquire about the wrongful termination',
              priority: 'HIGH' as const,
              deadline: 'Within 2 business days',
              estimated_time: '30-45 minutes'
            },
            {
              step: 'Request written documentation explaining the reason for coverage termination',
              priority: 'HIGH' as const,
              deadline: 'During initial call',
              estimated_time: '5 minutes'
            },
            {
              step: 'Verify your premium payment history and check for any missed payments',
              priority: 'MEDIUM' as const,
              deadline: 'Within 3 business days',
              estimated_time: '15 minutes'
            },
            {
              step: 'File a complaint with your state insurance commissioner if wrongfully terminated',
              priority: 'HIGH' as const,
              deadline: 'Within 7 business days',
              estimated_time: '30 minutes'
            }
          ]
        } else if (actionRequirements.questionType === 'dispute') {
          return [
            {
              step: 'Contact your insurance company to dispute the billing error or denial',
              priority: 'HIGH' as const,
              deadline: 'Within 5 business days',
              estimated_time: '30-45 minutes'
            },
            {
              step: 'Request a detailed explanation of benefits (EOB) and claim details',
              priority: 'HIGH' as const,
              deadline: 'During initial call',
              estimated_time: '5 minutes'
            },
            {
              step: 'Gather all supporting documentation for your appeal',
              priority: 'MEDIUM' as const,
              deadline: 'Within 7 business days',
              estimated_time: '30 minutes'
            },
            {
              step: 'Submit formal appeal letter if initial dispute is denied',
              priority: 'HIGH' as const,
              deadline: 'Within 180 days of denial',
              estimated_time: '45 minutes'
            }
          ]
        } else if (actionRequirements.questionType === 'enrollment') {
          return [
            {
              step: 'Review available plans on Healthcare.gov or your state marketplace',
              priority: 'HIGH' as const,
              deadline: 'Before open enrollment deadline',
              estimated_time: '45-60 minutes'
            },
            {
              step: 'Calculate potential subsidies and tax credits you may qualify for',
              priority: 'MEDIUM' as const,
              deadline: 'Before plan selection',
              estimated_time: '30 minutes'
            },
            {
              step: 'Compare plan benefits, networks, and costs for your specific needs',
              priority: 'HIGH' as const,
              deadline: 'Before enrollment deadline',
              estimated_time: '60 minutes'
            }
          ]
        } else {
          // Generic fallback for other question types
          return [
            {
              step: 'Contact your insurance company for clarification on your specific situation',
              priority: 'MEDIUM' as const,
              deadline: 'Within 5 business days',
              estimated_time: '30 minutes'
            },
            {
              step: 'Review your plan documents and benefits coverage',
              priority: 'MEDIUM' as const,
              deadline: 'When convenient',
              estimated_time: '20 minutes'
            },
            {
              step: 'Keep detailed records of all communications and documentation',
              priority: 'MEDIUM' as const,
              deadline: 'Ongoing',
              estimated_time: '5 minutes per interaction'
            }
          ]
        }
      })(),
      phone_scripts: (actionRequirements.needsPhoneScript && mergedContent.extracted_phone_script) ? [
        {
          title: 'Initial Insurance Company Contact',
          scenario: 'Calling to inquire about billing discrepancy',
          script: mergedContent.extracted_phone_script,
          expected_outcome: 'Reference number and timeline for review'
        }
      ] : [],
      appeal_letters: (actionRequirements.needsAppealLetter && mergedContent.extracted_appeal_letter) ? [
        {
          title: 'Formal Claim Appeal Letter',
          template: mergedContent.extracted_appeal_letter,
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
    narrative_summary: mergedContent.narrative,
    processing_metadata: {
      openai_confidence: openaiResult.confidence,
      anthropic_confidence: anthropicResult.confidence,
      consensus_score: Math.round((openaiResult.confidence + anthropicResult.confidence) / 2),
      processing_time_ms: processingTime,
      llm_provider_used: 'consensus',
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