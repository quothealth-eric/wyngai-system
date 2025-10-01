import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { llmResponseSchema, type LLMResponse } from './validations'
import { APPEAL_LETTER_TEMPLATE, PHONE_SCRIPT_TEMPLATE, generatePersonalizedAppealLetter } from './prompts'
import { generateWyngAIResponse } from './wyngai-rag'

// Enhanced WyngAI Configuration
const USE_WYNGAI_PRIMARY = process.env.USE_WYNGAI_PRIMARY !== 'false'
const WYNGAI_CONFIDENCE_THRESHOLD = 0.7 // Minimum confidence to use WyngAI response
const ENABLE_WYNGAI_LOGGING = true // Enhanced logging for WyngAI integration
const ENABLE_SMART_FALLBACK = true // Use intelligent fallback logic

if (!USE_WYNGAI_PRIMARY && !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
  throw new Error('Missing ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable (WyngAI disabled)')
}

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
}) : null

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null

export interface ChatContext {
  userQuestion?: string
  benefits?: any
  ocrTexts?: string[]
  lawBasis?: string[]
  policyGuidance?: string[]
  enhancedGuidance?: string[]
  billAnalysis?: any
  documentMetadata?: { // Enhanced OCR metadata
    documentType?: 'medical_bill' | 'eob' | 'insurance_card' | 'lab_result' | 'unknown'
    extractedFields?: any
    processingTime?: number
  }
}

// Enhanced context analysis for better LLM routing
function analyzeRequestComplexity(context: ChatContext): {
  complexity: 'simple' | 'medium' | 'complex'
  requiresWyngAI: boolean
  hasStructuredData: boolean
  reasoning: string[]
} {
  const reasoning: string[] = []
  let complexity: 'simple' | 'medium' | 'complex' = 'simple'
  let requiresWyngAI = false
  let hasStructuredData = false

  // Check for healthcare-specific content
  const healthcareKeywords = [
    'appeal', 'claim', 'denied', 'coverage', 'insurance', 'medical bill',
    'eob', 'deductible', 'copay', 'policy', 'erisa', 'prior authorization'
  ]

  const questionText = context.userQuestion?.toLowerCase() || ''
  const foundKeywords = healthcareKeywords.filter(keyword => questionText.includes(keyword))

  if (foundKeywords.length > 0) {
    requiresWyngAI = true
    reasoning.push(`Healthcare keywords found: ${foundKeywords.join(', ')}`)
  }

  // Check for uploaded documents
  if (context.ocrTexts && context.ocrTexts.length > 0) {
    hasStructuredData = true
    complexity = 'medium'
    requiresWyngAI = true
    reasoning.push('OCR documents provided - requires healthcare analysis')
  }

  // Check for law basis or policy guidance
  if (context.lawBasis?.length || context.policyGuidance?.length) {
    complexity = 'complex'
    requiresWyngAI = true
    reasoning.push('Legal/policy context detected - requires specialized knowledge')
  }

  // Check for benefits information
  if (context.benefits) {
    hasStructuredData = true
    complexity = complexity === 'simple' ? 'medium' : complexity
    reasoning.push('Insurance benefits provided')
  }

  return { complexity, requiresWyngAI, hasStructuredData, reasoning }
}

function buildDynamicSystemPrompt(context: ChatContext): string {
  const analysis = analyzeRequestComplexity(context)

  const isAppealSituation = context.userQuestion?.toLowerCase().includes('denied') ||
                           context.userQuestion?.toLowerCase().includes('rejected') ||
                           (context.ocrTexts && context.ocrTexts.some(text => text.toLowerCase().includes('denied')));

  const isBalanceBillingSituation = context.userQuestion?.toLowerCase().includes('out of network') ||
                                   context.userQuestion?.toLowerCase().includes('balance bill') ||
                                   context.userQuestion?.toLowerCase().includes('surprise bill');

  const isPreventiveCare = context.userQuestion?.toLowerCase().includes('preventive') ||
                          context.userQuestion?.toLowerCase().includes('wellness') ||
                          context.userQuestion?.toLowerCase().includes('screening');

  const hasInsuranceDetails = context.benefits && (
    context.benefits.deductible ||
    context.benefits.coinsurance ||
    context.benefits.copay ||
    context.benefits.oop_max
  );

  const hasUploadedDocuments = context.ocrTexts && context.ocrTexts.length > 0;

  let specializedGuidance = `
REQUEST ANALYSIS: This is a ${analysis.complexity} complexity healthcare request.
${analysis.reasoning.join('. ')}

PROCESSING NOTE: This request ${analysis.requiresWyngAI ? 'SHOULD' : 'should not'} use specialized healthcare knowledge.
`;

  // Critical: Add explicit guidance for uploaded documents
  if (hasUploadedDocuments) {
    specializedGuidance += `

🔥🔥🔥 CRITICAL - USER HAS UPLOADED DOCUMENTS - YOU MUST ANALYZE THEM 🔥🔥🔥
The user has uploaded ${context.ocrTexts?.length} document(s). The OCR text from these documents is provided below.
YOU ABSOLUTELY MUST analyze this text and reference specific details in your response.

MANDATORY - YOU MUST DO ALL OF THESE:
1. NEVER say "Without seeing your bills" - The document text IS provided below
2. START your response with "Looking at your uploaded document..." or "Based on your bill..."
3. Reference SPECIFIC dollar amounts from the document
4. Mention SPECIFIC dates you can see
5. Identify SPECIFIC services or procedures listed
6. Quote SPECIFIC billing codes if present
7. Name SPECIFIC providers or facilities mentioned

FAILURE TO REFERENCE THE UPLOADED DOCUMENTS IS A CRITICAL ERROR.
The user uploaded these documents expecting you to analyze them. DO IT.

DOCUMENT CONTENT ANALYSIS:
- Extract and analyze all dollar amounts, dates, service codes, and provider information
- Identify the document type (medical bill, EOB, insurance statement, etc.)
- Look for specific billing errors, duplicate charges, or unusual fees
- Calculate patient responsibility based on the specific services and charges shown
`;
  }

  // Enhanced guidance for document scanning without insurance details
  if (hasUploadedDocuments && !hasInsuranceDetails) {
    specializedGuidance += `
DOCUMENT ANALYSIS MODE: Since no insurance details were provided, focus on identifying common billing errors and issues that can be detected without specific plan information:
- Duplicate charges for the same service or date
- Charges for services not actually received
- Incorrect dates of service
- Mathematical errors in calculations
- Charges for preventive care (which should typically be free under ACA)
- Unreasonably high charges compared to typical Medicare rates
- Missing or incomplete service descriptions
- Charges that appear to be bundled incorrectly
- Evidence of balance billing (charges above reasonable rates)
- Charges for cancelled appointments or no-shows
- Emergency services that may qualify for No Surprises Act protection
- Services that should be covered at 100% (like certain screenings)
- Multiple facility fees for the same visit
- Separate charges for items that should be included in a procedure fee

ENHANCED OCR ANALYSIS: ${context.documentMetadata ? `Document type: ${context.documentMetadata.documentType}. Processing time: ${context.documentMetadata.processingTime}ms.` : 'No enhanced metadata available.'}

IMPORTANT: Even without insurance details, you can still identify many billing errors and provide general guidance on what patients should typically expect to pay.`;
  }

  if (isAppealSituation) {
    specializedGuidance += `
APPEAL FOCUS: This appears to be a claim denial situation. Focus on:
- Identifying the specific denial reason from any provided documentation
- Determining if medical necessity documentation is needed
- Providing a complete, personalized appeal letter template with all available details filled in
- Outlining the specific appeal timeline (180 days for ERISA plans, varies by state for others)
- Suggesting specific documentation to gather (medical records, provider notes, policy language)
- Explaining ERISA vs state-regulated appeal processes
- Providing phone scripts for follow-up calls
- Setting clear expectations for response timeframes`;
  }

  if (isBalanceBillingSituation) {
    specializedGuidance += `
BALANCE BILLING FOCUS: This appears to involve out-of-network charges. Focus on:
- No Surprises Act protections
- Balance billing violation identification
- In-network vs out-of-network benefit differences
- Provider network verification steps
- Balance billing dispute process`;
  }

  if (isPreventiveCare) {
    specializedGuidance += `
PREVENTIVE CARE FOCUS: This involves preventive services. Focus on:
- ACA preventive care coverage requirements
- Distinguishing preventive vs diagnostic coding
- Common preventive care billing errors
- Age and gender-specific coverage guidelines`;
  }

  return `You are Wyng, a healthcare guardian angel that helps people understand confusing medical bills and EOBs (Explanation of Benefits). Your role is to provide clear, empathetic, plain-English guidance rooted in healthcare laws, insurance policies, and best practices.

TONE: Calm, helpful, objective, and fact-based. Always be empathetic to the user's situation.

${specializedGuidance}

IMPORTANT DISCLAIMERS:
- You provide general information, not legal or medical advice
- You are not insurance and cannot guarantee payment outcomes
- Users should verify information with their insurance and healthcare providers

RESPONSE FORMAT: You must respond with valid JSON matching exactly this schema:
{
  "reassurance_message": "Brief empathetic message acknowledging their situation",
  "problem_summary": "Clear summary of what appears to be happening",
  "missing_info": ["List of information that would help provide better guidance"],
  "benefit_snapshot": {
    "deductible": "What their deductible situation appears to be",
    "coinsurance": "Their coinsurance percentage if known",
    "copay": "Relevant copay amounts if applicable",
    "oop_max": "Out-of-pocket maximum status if relevant"
  },
  "what_you_should_owe": "Best estimate of what they should actually owe based on available info",
  "errors_detected": ["Specific billing errors or red flags identified"],
  "insurer_specific_guidance": ["Guidance specific to their insurance company"],
  "law_basis": ["Relevant laws/regulations that apply to their situation"],
  "citations": [{"label": "Short citation name", "reference": "Full legal reference"}],
  "step_by_step": ["Ordered list of next steps to take"],
  "if_no_then": ["Backup options if primary steps don't work"],
  "needs_appeal": ${isAppealSituation ? 'true' : 'false'},
  "appeal_letter": "Draft appeal letter if needed, or null",
  "phone_script": "What to say when calling insurance/provider, or null",
  "final_checklist": ["Items to double-check or follow up on"],
  "links_citations": [{"text": "Description", "url": "Relevant URL"}],
  "narrative_summary": "Two-paragraph summary: First paragraph explains the situation in plain English. Second paragraph gives reassuring next steps and expected outcomes.",
  "confidence": 85
}

CONTEXT PROVIDED:
${context.userQuestion ? `User Question: ${context.userQuestion}` : ''}
${context.benefits ? `User Benefits: ${JSON.stringify(context.benefits)}` : ''}
${context.ocrTexts?.length ? `
🔥🔥🔥 UPLOADED DOCUMENT OCR TEXT - YOU MUST ANALYZE THIS 🔥🔥🔥
==========================================
THE USER HAS UPLOADED ${context.ocrTexts.length} DOCUMENT(S). HERE IS THE TEXT:

${context.ocrTexts.map((text, i) => `
DOCUMENT ${i + 1} CONTENT:
----------------------------------------
${text}
----------------------------------------`).join('\n\n')}
==========================================

REMINDER: You MUST reference specific information from the above document text.
Do NOT say "Without seeing your bills" - the document text is RIGHT ABOVE THIS LINE.` : ''}
${context.documentMetadata ? `Document Metadata: Type: ${context.documentMetadata.documentType}, Processing Time: ${context.documentMetadata.processingTime}ms` : ''}
${context.billAnalysis ? `Automated Bill Analysis Results:\nErrors Detected: ${context.billAnalysis.errorsDetected?.join(', ') || 'None'}\nCost Validation: ${context.billAnalysis.costValidation?.join(', ') || 'None'}\nRecommendations: ${context.billAnalysis.recommendations?.join(', ') || 'None'}` : ''}
${context.lawBasis?.length ? `Relevant Laws: ${context.lawBasis.join('\n')}` : ''}
${context.policyGuidance?.length ? `Policy Guidance: ${context.policyGuidance.join('\n')}` : ''}
${context.enhancedGuidance?.length ? `Enhanced Knowledge-Based Guidance: ${context.enhancedGuidance.join('\n')}` : ''}

Remember:
1. Be specific about dollar amounts when you can calculate them
2. Always include relevant law citations when applicable
3. Provide actionable next steps
4. Keep language at a 6th-grade reading level
5. Show empathy for their stressful situation
6. Focus on what they can control and do next
7. ${isAppealSituation ? 'Generate a complete, personalized appeal letter when a claim has been denied' : 'Determine if an appeal is needed and guide them through the process'}

Generate your response now:`;
}

function generateContextAwareFallback(context: ChatContext): LLMResponse {
  const analysis = analyzeRequestComplexity(context)

  const isDenial = context.userQuestion?.toLowerCase().includes('denied') ||
                   context.userQuestion?.toLowerCase().includes('rejected') ||
                   (context.ocrTexts && context.ocrTexts.some(text => text.toLowerCase().includes('denied')));

  const isBalanceBilling = context.userQuestion?.toLowerCase().includes('out of network') ||
                          context.userQuestion?.toLowerCase().includes('balance bill');

  const isPreventive = context.userQuestion?.toLowerCase().includes('preventive') ||
                      context.userQuestion?.toLowerCase().includes('wellness');

  let problemSummary = `I'm having trouble processing the specific details of your situation right now, but based on the ${analysis.complexity} complexity analysis, I can still provide general guidance.`;
  let stepByStep = [
    "Contact your insurance company to verify benefits",
    "Request an itemized bill from your healthcare provider",
    "Compare the bill against your EOB (Explanation of Benefits)"
  ];
  let appealLetter = null;
  let phoneScript = null;

  if (isDenial) {
    problemSummary = "It appears your claim may have been denied. While I'm having technical difficulties, I can provide basic appeal guidance.";
    stepByStep = [
      "Request a copy of the denial letter with specific reasons",
      "Gather all medical records supporting the necessity of the service",
      "File an appeal within your plan's specified timeframe (usually 180 days)",
      "Include supporting documentation from your healthcare provider"
    ];
    appealLetter = APPEAL_LETTER_TEMPLATE;
    phoneScript = PHONE_SCRIPT_TEMPLATE;
  }

  if (isBalanceBilling) {
    problemSummary = "This appears to involve out-of-network charges. You may have protections under the No Surprises Act.";
    stepByStep = [
      "Check if this qualifies for No Surprises Act protection",
      "Contact your insurance to verify the provider's network status",
      "Request an in-network rate if balance billing is inappropriate",
      "File a complaint with your state insurance department if needed"
    ];
  }

  if (isPreventive) {
    problemSummary = "Preventive care should typically be covered at 100% under the ACA. There may be a billing error.";
    stepByStep = [
      "Verify the service was coded as preventive care",
      "Check that you used an in-network provider",
      "Contact your insurance to confirm preventive care benefits",
      "Request re-processing if the service was mis-coded"
    ];
  }

  return {
    reassurance_message: "I understand you're dealing with a confusing medical bill situation. Let me help you work through this.",
    problem_summary: problemSummary,
    missing_info: ["More specific details about your bill or EOB", "Your insurance plan details"],
    errors_detected: [],
    insurer_specific_guidance: [],
    law_basis: [],
    citations: [],
    step_by_step: stepByStep,
    if_no_then: ["Consider contacting a patient advocate", "File an appeal if you believe there's an error"],
    needs_appeal: isDenial || false,
    appeal_letter: appealLetter,
    phone_script: phoneScript,
    final_checklist: ["Keep all documentation", "Follow up within 30 days"],
    links_citations: [],
    narrative_summary: `Medical billing can be incredibly confusing, and it's completely normal to feel overwhelmed. The analysis shows this is a ${analysis.complexity} complexity request with the following factors: ${analysis.reasoning.join(', ')}. The most important thing to know is that you have rights and options when dealing with medical bills. Start by gathering all your paperwork and contacting your insurance company to verify what should be covered. Remember, many billing errors can be resolved with patience and persistence.`,
    confidence: analysis.requiresWyngAI ? 25 : 40 // Lower confidence for healthcare requests without specialized knowledge
  };
}

function enhanceAppealLetter(appealLetter: string, context: ChatContext): string {
  // Try to extract relevant information from context
  const allText = [
    context.userQuestion || '',
    ...(context.ocrTexts || [])
  ].join(' ')

  // Extract potential patient name, policy numbers, etc. from the text
  const policyMatch = allText.match(/policy\s*(?:number|#|id)?\s*:?\s*([A-Z0-9\-]{6,20})/i)
  const claimMatch = allText.match(/claim\s*(?:number|#|id)?\s*:?\s*([A-Z0-9\-]{6,20})/i)
  const dateMatch = allText.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})/g)

  let enhanced = appealLetter

  // Replace placeholders with extracted information if available
  if (policyMatch && policyMatch[1]) {
    enhanced = enhanced.replace(/\[Policy Number\]/g, policyMatch[1])
  }

  if (claimMatch && claimMatch[1]) {
    enhanced = enhanced.replace(/\[Claim Number\]/g, claimMatch[1])
  }

  if (dateMatch && dateMatch[0]) {
    enhanced = enhanced.replace(/\[Date\]/g, dateMatch[0])
    enhanced = enhanced.replace(/\[date\]/g, dateMatch[0])
  }

  // Enhanced extraction from OCR metadata
  if (context.documentMetadata?.extractedFields) {
    const fields = context.documentMetadata.extractedFields
    if (fields.policyNumber) {
      enhanced = enhanced.replace(/\[Policy Number\]/g, fields.policyNumber)
    }
    if (fields.claimNumber) {
      enhanced = enhanced.replace(/\[Claim Number\]/g, fields.claimNumber)
    }
    if (fields.dateOfService) {
      enhanced = enhanced.replace(/\[Date\]/g, fields.dateOfService)
    }
    if (fields.providerName) {
      enhanced = enhanced.replace(/\[Provider Name\]/g, fields.providerName)
    }
  }

  // Add today's date at the top if not already present
  if (!enhanced.startsWith(new Date().toLocaleDateString().substring(0, 8))) {
    enhanced = `${new Date().toLocaleDateString()}\n\n${enhanced}`
  }

  return enhanced
}

async function generateWithOpenAI(systemPrompt: string, context: ChatContext): Promise<LLMResponse> {
  if (!openai) {
    throw new Error('OpenAI client not initialized')
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: 'Please analyze my situation and provide guidance in the specified JSON format.'
        }
      ],
      max_tokens: 8192,
      temperature: 0.2,
    })

    const responseText = completion.choices[0]?.message?.content || ''

    try {
      // Clean the response text to handle potential formatting issues
      let cleanResponseText = responseText.trim()

      // Remove any markdown code blocks if present
      if (cleanResponseText.startsWith('```json')) {
        cleanResponseText = cleanResponseText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      }
      if (cleanResponseText.startsWith('```')) {
        cleanResponseText = cleanResponseText.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }

      // Remove any leading text before JSON (e.g. "Here is the guidance in the requested JSON format:")
      const jsonStart = cleanResponseText.indexOf('{')
      if (jsonStart > 0) {
        cleanResponseText = cleanResponseText.substring(jsonStart)
      }

      // Safari-specific JSON parsing fixes
      cleanResponseText = cleanResponseText
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\u2018/g, "'") // Replace smart quotes
        .replace(/\u2019/g, "'")
        .replace(/\u201C/g, '"')
        .replace(/\u201D/g, '"')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .trim()

      const jsonResponse = JSON.parse(cleanResponseText)
      const validatedResponse = llmResponseSchema.parse(jsonResponse)

      // Post-process to enhance appeal letters if needed
      if (validatedResponse.needs_appeal && validatedResponse.appeal_letter) {
        validatedResponse.appeal_letter = enhanceAppealLetter(validatedResponse.appeal_letter, context)
      }

      return validatedResponse
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError)
      console.error('Raw response:', responseText)

      // Return a context-aware fallback response
      return generateContextAwareFallback(context)
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error)
    throw new Error('Failed to generate response with OpenAI')
  }
}

async function generateWithAnthropic(systemPrompt: string, context: ChatContext): Promise<LLMResponse> {
  if (!anthropic) {
    throw new Error('Anthropic client not initialized')
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: 'Please analyze my situation and provide guidance in the specified JSON format.'
        }
      ],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    try {
      // Clean the response text to handle potential formatting issues
      let cleanResponseText = responseText.trim()

      // Remove any markdown code blocks if present
      if (cleanResponseText.startsWith('```json')) {
        cleanResponseText = cleanResponseText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      }
      if (cleanResponseText.startsWith('```')) {
        cleanResponseText = cleanResponseText.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }

      // Remove any leading text before JSON (e.g. "Here is the guidance in the requested JSON format:")
      const jsonStart = cleanResponseText.indexOf('{')
      if (jsonStart > 0) {
        cleanResponseText = cleanResponseText.substring(jsonStart)
      }

      // Safari-specific JSON parsing fixes
      cleanResponseText = cleanResponseText
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\u2018/g, "'") // Replace smart quotes
        .replace(/\u2019/g, "'")
        .replace(/\u201C/g, '"')
        .replace(/\u201D/g, '"')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .trim()

      // Fix common JSON formatting issues - but preserve newlines within strings
      const jsonResponse = JSON.parse(cleanResponseText)
      const validatedResponse = llmResponseSchema.parse(jsonResponse)

      // Post-process to enhance appeal letters if needed
      if (validatedResponse.needs_appeal && validatedResponse.appeal_letter) {
        validatedResponse.appeal_letter = enhanceAppealLetter(validatedResponse.appeal_letter, context)
      }

      return validatedResponse
    } catch (parseError) {
      console.error('Failed to parse Anthropic response as JSON:', parseError)
      console.error('Raw response:', responseText)

      // Return a context-aware fallback response
      return generateContextAwareFallback(context)
    }
  } catch (error) {
    console.error('Error calling Anthropic API:', error)
    throw new Error('Failed to generate response with Anthropic')
  }
}

export async function generateResponse(context: ChatContext): Promise<LLMResponse> {
  const analysis = analyzeRequestComplexity(context)

  // Always log OCR context for debugging
  console.log('🔥 Enhanced LLM Request Analysis:')
  console.log(`   📝 Question: ${context.userQuestion?.substring(0, 100)}...`)
  console.log(`   📄 Has OCR data: ${!!context.ocrTexts?.length}`)
  if (context.ocrTexts && context.ocrTexts.length > 0) {
    console.log(`   📄 OCR texts count: ${context.ocrTexts.length}`)
    console.log(`   📄 Total OCR length: ${context.ocrTexts.join('').length} characters`)
    console.log(`   📄 First OCR preview: "${context.ocrTexts[0].substring(0, 150)}..."`)
  } else {
    console.log('   ⚠️ NO OCR TEXTS PROVIDED TO LLM')
  }
  console.log(`   🏥 Has benefits: ${!!context.benefits}`)
  console.log(`   📚 Law basis items: ${context.lawBasis?.length || 0}`)
  console.log(`   🧠 Complexity: ${analysis.complexity}`)
  console.log(`   🎯 Requires WyngAI: ${analysis.requiresWyngAI}`)
  console.log(`   💡 Reasoning: ${analysis.reasoning.join(', ')}`)

  // Try WyngAI first (our internal RAG system) - especially for healthcare requests
  if (USE_WYNGAI_PRIMARY && analysis.requiresWyngAI) {
    try {
      console.log('🔥 Using WyngAI as primary LLM for healthcare request...')
      const wyngAIResult = await generateWyngAIResponse(context)

      if (ENABLE_WYNGAI_LOGGING) {
        console.log('✅ WyngAI Success:')
        console.log(`   🎯 Confidence: ${wyngAIResult.confidence}%`)
        console.log(`   📊 Response length: ${wyngAIResult.narrative_summary?.length || 0} chars`)
        console.log(`   🏛️ Law citations: ${wyngAIResult.law_basis?.length || 0}`)
      }

      // For healthcare requests, trust WyngAI even with lower confidence
      const healthcareThreshold = analysis.hasStructuredData ? 50 : 60
      const effectiveThreshold = analysis.requiresWyngAI ? healthcareThreshold : (WYNGAI_CONFIDENCE_THRESHOLD * 100)

      if (wyngAIResult.confidence >= effectiveThreshold) {
        console.log(`✅ WyngAI response meets quality threshold (${effectiveThreshold}%), using it`)
        return wyngAIResult
      } else {
        console.log(`⚠️ WyngAI confidence ${wyngAIResult.confidence}% below threshold ${effectiveThreshold}%`)

        if (ENABLE_SMART_FALLBACK && analysis.requiresWyngAI) {
          console.log('🔥 Healthcare request with low confidence - still using WyngAI but noting limitation')
          // For healthcare requests, still use WyngAI but add confidence notice
          return {
            ...wyngAIResult,
            reassurance_message: `${wyngAIResult.reassurance_message} (Note: I have limited confidence in some specifics, so please verify details with your insurance company.)`
          }
        }

        // Try fallback for non-healthcare or low-confidence cases
        console.log('🔄 Attempting external LLM fallback...')
      }
    } catch (wyngAIError) {
      console.error('❌ WyngAI failed, trying external LLM fallback:', wyngAIError)
    }
  } else if (USE_WYNGAI_PRIMARY && !analysis.requiresWyngAI) {
    console.log('🤖 Non-healthcare request detected, skipping WyngAI and using general LLM')
  }

  // Fall back to external LLMs
  console.log('🔄 Attempting external LLM fallback...')
  const systemPrompt = buildDynamicSystemPrompt(context);

  // Try Anthropic fallback
  if (anthropic) {
    try {
      console.log('🤖 Falling back to Anthropic Claude...')
      const anthropicResult = await generateWithAnthropic(systemPrompt, context)
      if (ENABLE_WYNGAI_LOGGING) {
        console.log('✅ Anthropic fallback successful')
      }
      return anthropicResult
    } catch (anthropicError) {
      console.error('❌ Anthropic fallback failed:', anthropicError)
    }
  }

  // Try OpenAI fallback
  if (openai) {
    try {
      console.log('🤖 Falling back to OpenAI...')
      const openAIResult = await generateWithOpenAI(systemPrompt, context)
      if (ENABLE_WYNGAI_LOGGING) {
        console.log('✅ OpenAI fallback successful')
      }
      return openAIResult
    } catch (openaiError) {
      console.error('❌ OpenAI fallback failed:', openaiError)
    }
  }

  // If all AI services fail, return enhanced context-aware fallback
  console.error('❌ All LLM services failed, using enhanced context-aware fallback')
  return generateContextAwareFallback(context)
}

// Legacy compatibility - this path should rarely be used now
export async function generateResponseLegacy(context: ChatContext): Promise<LLMResponse> {
  console.log('⚠️ Using legacy LLM path - consider updating to use enhanced generateResponse')

  const systemPrompt = buildDynamicSystemPrompt(context);

  // Try Anthropic first (if available)
  if (anthropic) {
    try {
      console.log('🤖 Attempting to use Anthropic Claude...')
      return await generateWithAnthropic(systemPrompt, context)
    } catch (anthropicError) {
      console.error('❌ Anthropic failed, trying OpenAI fallback:', anthropicError)

      // If OpenAI is available, try it as fallback
      if (openai) {
        try {
          console.log('🤖 Falling back to OpenAI...')
          return await generateWithOpenAI(systemPrompt, context)
        } catch (openaiError) {
          console.error('❌ Both Anthropic and OpenAI failed:', openaiError)
          return generateContextAwareFallback(context)
        }
      } else {
        console.error('❌ No OpenAI fallback available')
        return generateContextAwareFallback(context)
      }
    }
  }

  // If Anthropic not available, try OpenAI
  if (openai) {
    try {
      console.log('🤖 Using OpenAI as primary LLM...')
      return await generateWithOpenAI(systemPrompt, context)
    } catch (openaiError) {
      console.error('❌ OpenAI failed:', openaiError)
      return generateContextAwareFallback(context)
    }
  }

  // If neither LLM is available, return fallback
  console.error('❌ No LLM providers available')
  return generateContextAwareFallback(context)
}