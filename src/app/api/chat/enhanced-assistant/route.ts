/**
 * Enhanced WyngAI Assistant API Route
 * Integrates new RAG pipeline, intent classification, and conversational features
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EnhancedIntentRouter } from '@/lib/intent/enhanced-router'
import { EnhancedRAGRetriever } from '@/lib/rag/enhanced-retriever'
import { EnhancedAnswerComposer } from '@/lib/rag/enhanced-answer-composer'
import {
  ChatSession,
  ChatMessage,
  ChatContext,
  ChatResponse,
  ExtractedEntities,
  RAGQuery
} from '@/lib/types/rag'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

// Route configuration
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      text,
      files = [],
      chatId,
      caseId,
      planInputs,
      userId,
      conversationHistory = [],
      isFollowUp = false
    } = body

    console.log('💬 Processing enhanced WyngAI assistant request:', {
      hasText: !!text,
      filesCount: files.length,
      chatId,
      caseId,
      isFollowUp,
      historyLength: conversationHistory.length
    })

    // Validate required fields
    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Question text is required' },
        { status: 400 }
      )
    }

    // Initialize enhanced services
    const intentRouter = new EnhancedIntentRouter()
    const retriever = new EnhancedRAGRetriever()
    const answerComposer = new EnhancedAnswerComposer()

    // Step 1: Intent Classification with confidence scoring
    const intentResult = await intentRouter.routeIntent({
      text,
      files: files.map((f: any) => ({ name: f.name, size: f.size, type: f.type })),
      context: {
        previousIntent: conversationHistory.length > 0 ? 'CHAT' : undefined,
        conversationHistory: conversationHistory.map((msg: any) => msg.content)
      }
    })

    console.log('🎯 Intent classification:', {
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      themes: intentResult.themes?.slice(0, 3),
      state: intentResult.state,
      marketplace: intentResult.marketplace
    })

    // If analyzer intent but no files, prompt for files
    if (intentResult.intent === 'ANALYZER' && files.length === 0) {
      return NextResponse.json({
        success: true,
        response: {
          answer: "I'd be happy to analyze your medical bill or EOB for errors and savings opportunities. Please upload your itemized bill and explanation of benefits (EOB) if you have one.",
          citations: [],
          nextSteps: [
            'Upload your itemized medical bill (required)',
            'Upload your EOB (explanation of benefits) if available',
            'Provide any additional plan details for more accurate analysis'
          ],
          scripts: [],
          forms: [],
          confidence: 0.9,
          authorities_used: [],
          clarification: {
            question: 'Please upload your medical documents to begin analysis',
            intent: 'file_upload_required',
            options: undefined
          }
        },
        session: {
          chat_id: chatId || 'temp-session',
          context: { intentResult }
        }
      })
    }

    // Step 2: Extract entities from query and context
    const entities: ExtractedEntities = {
      planType: intentResult.payer || planInputs?.planType,
      state: intentResult.state || planInputs?.state,
      keywords: text.split(/\s+/).filter((word: string) => word.length > 3),
      intent: intentResult.themes?.[0]?.theme.toLowerCase().replace(/\s+/g, '_'),
      urgency: intentResult.confidence > 0.8 ? 'high' : 'medium'
    }

    // Step 3: Build context with conversation history for follow-ups
    const chatContext: ChatContext = {
      planInputs: planInputs || {},
      userState: intentResult.state,
      collectedFacts: {},
      clarificationHistory: isFollowUp ? conversationHistory : []
    }

    // Step 4: Check if clarification is needed (skip for follow-ups with context)
    if (intentResult.intent === 'CLARIFY' && !isFollowUp) {
      const clarificationResponse: ChatResponse = {
        answer: intentResult.suggestedActions
          ? "I can help you with either of these options. Which would you like to do?"
          : "I need a bit more information to provide the best guidance. Could you be more specific about what you'd like help with?",
        citations: [],
        nextSteps: ['Choose your preferred option below'],
        scripts: [],
        forms: [],
        confidence: intentResult.confidence,
        authorities_used: [],
        clarification: {
          question: intentResult.suggestedActions
            ? "Please choose how I can help you:"
            : "What specific aspect would you like help with?",
          intent: 'collect_missing_info',
          options: intentResult.suggestedActions?.map(action => action.label)
        }
      }

      return NextResponse.json({
        success: true,
        response: clarificationResponse,
        session: {
          chat_id: chatId || 'temp-session',
          context: { ...chatContext, intentResult }
        }
      })
    }

    // Step 5: Build RAG query for retrieval
    const ragQuery: RAGQuery = {
      text,
      entities,
      context: chatContext,
      chat_id: chatId || 'temp-session',
      max_chunks_per_authority: 8 // Get more sources for better answers
    }

    // Step 6: Enhanced RAG retrieval with hybrid search
    let response: ChatResponse
    try {
      console.log('🔍 Starting enhanced RAG retrieval...')
      const retrievalResult = await retriever.retrieve(ragQuery)

      console.log('📚 RAG retrieval completed:', {
        totalSections: retrievalResult.sections.length,
        authoritiesUsed: retrievalResult.authorities_used,
        avgScore: retrievalResult.sections.length > 0
          ? retrievalResult.sections.reduce((sum, s) => sum + s.score, 0) / retrievalResult.sections.length
          : 0
      })

      // Step 7: Generate enhanced answer with citations
      response = await answerComposer.composeAnswer(
        text,
        entities,
        retrievalResult,
        chatContext
      )

      console.log('✅ Enhanced answer generated:', {
        confidence: response.confidence,
        citationsCount: response.citations.length,
        nextStepsCount: response.nextSteps.length,
        scriptsCount: response.scripts.length
      })

    } catch (error) {
      console.log('⚠️ RAG retrieval failed, using enhanced fallback:', error)

      // Enhanced fallback response based on intent classification
      const fallbackGuidance = generateFallbackGuidance(intentResult, entities)

      response = {
        answer: fallbackGuidance.answer,
        citations: [],
        nextSteps: fallbackGuidance.nextSteps,
        scripts: fallbackGuidance.scripts,
        forms: [],
        confidence: 0.6,
        authorities_used: [],
        jargonExplanations: fallbackGuidance.jargonExplanations,
        actionableLinks: fallbackGuidance.actionableLinks
      }
    }

    // Step 8: Update context with response and store interaction
    chatContext.lastAnswer = response

    // Store the intent classification for analytics
    await storeInteractionAnalytics({
      chatId: chatId || 'temp-session',
      intentResult,
      entities,
      response,
      processingTimeMs: intentResult.processingTimeMs || 0
    })

    console.log('✅ Enhanced WyngAI assistant response completed')

    return NextResponse.json({
      success: true,
      response,
      session: {
        chat_id: chatId || 'temp-session',
        context: chatContext
      },
      metadata: {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        themes: intentResult.themes,
        state: intentResult.state,
        marketplace: intentResult.marketplace,
        processingTimeMs: intentResult.processingTimeMs
      }
    })

  } catch (error) {
    console.error('❌ Enhanced WyngAI assistant error:', error)
    return NextResponse.json(
      {
        error: 'Failed to process enhanced assistant request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}


// Helper function moved to top level
function generateFallbackGuidance(intentResult: any, entities: ExtractedEntities) {
  const primaryTheme = intentResult.themes?.[0]?.theme || 'General Insurance'

  let answer = `I understand you're asking about ${primaryTheme.toLowerCase()}. `

  // Theme-specific fallback guidance
  switch (primaryTheme) {
    case 'Open Enrollment':
      answer += `Open Enrollment typically runs from November 1 to December 15 each year. During this time, you can enroll in a new health plan, change your current plan, or make updates to your coverage.`
      break
    case 'Special Enrollment Period':
      answer += `You may qualify for a Special Enrollment Period (SEP) if you've had a qualifying life event like losing coverage, getting married, moving, or having a baby. SEPs typically last 60 days from the qualifying event.`
      break
    case 'Prior Authorization':
      answer += `Prior authorization is approval from your insurance company before you receive certain medical services. Contact your insurance company or ask your provider to submit the request.`
      break
    default:
      answer += `While I'm building my comprehensive knowledge base, I can provide some general guidance.`
  }

  const nextSteps = [
    'Contact your insurance company using the customer service number on your ID card',
    `Review your plan documents for specific ${primaryTheme.toLowerCase()} details`,
    'Keep detailed records of all communications'
  ]

  const scripts = [{
    channel: 'payer' as const,
    purpose: `Get information about ${primaryTheme.toLowerCase()}`,
    body: `"Hi, I'm calling about my health insurance coverage. My member ID is [YOUR_ID]. I have a question about ${primaryTheme.toLowerCase()}. Can you help me understand my options and any requirements?"`,
    estimated_duration: '10-15 minutes'
  }]

  const actionableLinks = [
    {
      text: 'Healthcare.gov',
      url: 'https://www.healthcare.gov',
      description: 'Official health insurance marketplace'
    },
    {
      text: 'Contact Your State Insurance Regulator',
      url: 'https://content.naic.org/consumer/contact-your-state-insurance-regulator',
      description: 'Get help from your state insurance department'
    }
  ]

  const jargonExplanations = [
    {
      term: primaryTheme,
      definition: `This relates to your ${primaryTheme.toLowerCase()} question`,
      example: 'Each insurance topic has specific rules and procedures'
    }
  ]

  return {
    answer,
    nextSteps,
    scripts,
    actionableLinks,
    jargonExplanations
  }
}

// Helper function for analytics
async function storeInteractionAnalytics(data: {
  chatId: string
  intentResult: any
  entities: ExtractedEntities
  response: ChatResponse
  processingTimeMs: number
}) {
  try {
    // Store analytics event
    await supabase.from('analytics_events').insert({
      chat_id: data.chatId,
      event_name: 'enhanced_assistant_query',
      event_params: {
        intent: data.intentResult.intent,
        confidence: data.intentResult.confidence,
        themes: data.intentResult.themes,
        state: data.intentResult.state,
        marketplace: data.intentResult.marketplace,
        response_confidence: data.response.confidence,
        authorities_used: data.response.authorities_used,
        processing_time_ms: data.processingTimeMs
      }
    })
  } catch (error) {
    console.error('Failed to store analytics:', error)
    // Don't throw - analytics failure shouldn't break the request
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json({
    message: 'WyngAI Enhanced Assistant API',
    version: '2.0.0',
    capabilities: [
      'Enhanced intent classification with confidence scoring',
      'Multi-theme detection and context awareness',
      'Hybrid semantic + keyword RAG retrieval',
      'Authority-ranked source citations',
      'Contextual answer composition',
      'Actionable guidance with scripts and forms',
      'State-specific marketplace integration',
      'Conversation context preservation',
      'Real-time analytics and monitoring'
    ]
  })
}