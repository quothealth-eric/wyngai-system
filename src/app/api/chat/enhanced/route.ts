/**
 * Enhanced WyngAI Chat Endpoint
 * Direct integration with WyngAI RAG system + feature routing
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateResponse } from '@/lib/anthropic'
import type { ChatContext } from '@/lib/anthropic'
import { WyngAIClient } from '@/lib/wyngai-rag'
import { EmailGate } from '@/lib/email-gate'
import { getSearchEngine } from '@/lib/semantic-search'

// Route configuration
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

interface ChatRequest {
  case: {
    caseId: string;
    artifacts: any[];
    narrative: { text: string };
  };
  email: string;
}

interface ChatResponse {
  success: boolean;
  answer?: {
    answer: string;
    citations: Array<{
      title: string;
      authority: string;
      citation: string;
    }>;
    actionable_steps?: string[];
    phone_script?: string;
    suggested_questions?: string[];
    confidence_score?: number;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ChatResponse>> {
  try {
    console.log('🚀 Enhanced chat API called');

    const body = await request.json() as ChatRequest;
    const { case: caseData, email } = body;

    if (!caseData?.narrative?.text) {
      return NextResponse.json({
        success: false,
        error: 'Question text is required'
      }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({
        success: false,
        error: 'Email is required'
      }, { status: 400 });
    }

    // Check email gate
    try {
      const emailGateResult = await EmailGate.checkEmailAccess(email);
      if (!emailGateResult.emailOk) {
        return NextResponse.json({
          success: false,
          error: emailGateResult.message || 'Email access denied'
        }, { status: 403 });
      }
    } catch (emailError) {
      console.warn('Email gate check failed:', emailError);
      // Continue processing (fail open)
    }

    const query = caseData.narrative.text.trim();
    console.log(`🔍 Processing query: "${query.substring(0, 100)}..."`);

    // Use semantic search to find relevant knowledge
    const searchEngine = getSearchEngine();
    const searchResults = await searchEngine.comprehensiveSearch(query);

    if (searchResults.cards.length === 0) {
      // No direct matches found, provide general guidance
      return NextResponse.json({
        success: true,
        answer: {
          answer: "I'd be happy to help you with your healthcare question. While I don't have a specific answer card for your exact question, I can provide some general guidance. Could you rephrase your question or provide more details? You might also want to contact your insurance company directly or consult with a healthcare advocate for personalized assistance.",
          citations: [{
            title: "General Healthcare Information",
            authority: "Healthcare.gov",
            citation: "For personalized health insurance guidance, contact your insurance company or visit healthcare.gov for official information."
          }],
          suggested_questions: searchResults.suggestedQuestions,
          confidence_score: 0.3
        }
      });
    }

    // Use the best matching card
    const bestMatch = searchResults.cards[0];
    const confidence = Math.round(bestMatch.similarity * 100) / 100;

    console.log(`✅ Found match: ${bestMatch.card.question} (similarity: ${confidence})`);

    // Enhanced answer with context
    let enhancedAnswer = bestMatch.card.answer;

    // Add context if similarity is not perfect
    if (bestMatch.similarity < 0.9) {
      enhancedAnswer = `Based on your question, here's the most relevant information I have:\n\n${enhancedAnswer}`;
    }

    // Add suggested follow-up questions
    const suggestedQuestions = searchResults.suggestedQuestions.filter(q =>
      q !== bestMatch.card.question
    ).slice(0, 4);

    const response: ChatResponse = {
      success: true,
      answer: {
        answer: enhancedAnswer,
        citations: bestMatch.card.citations,
        actionable_steps: bestMatch.card.actionable_steps,
        phone_script: bestMatch.card.phone_script,
        suggested_questions: suggestedQuestions,
        confidence_score: confidence
      }
    };

    // Record usage for analytics
    try {
      await EmailGate.recordUsage(email);
    } catch (recordError) {
      console.warn('Failed to record usage:', recordError);
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Enhanced chat API error:', error);

    return NextResponse.json({
      success: false,
      error: 'Failed to process your question. Please try again or contact support if the problem persists.'
    }, { status: 500 });
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}