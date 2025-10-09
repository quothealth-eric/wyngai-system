import { NextRequest, NextResponse } from 'next/server';
import { UnifiedChatEngine } from '@/lib/chat/unified_chat';
import { UnifiedChatCase } from '@/types/chat';

const chatEngine = new UnifiedChatEngine();

export async function POST(request: NextRequest) {
  console.log('Processing chat follow-up...');

  try {
    const body = await request.json();
    const { message, previousChatCase, conversationId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    if (!previousChatCase) {
      return NextResponse.json(
        { error: 'Previous chat case is required for follow-up questions' },
        { status: 400 }
      );
    }

    if (message.length > 5000) {
      return NextResponse.json(
        { error: 'Message too long. Maximum length: 5000 characters' },
        { status: 400 }
      );
    }

    console.log(`Processing follow-up: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);

    // Validate and reconstruct the previous chat case
    const chatCase: UnifiedChatCase = {
      caseId: previousChatCase.caseId || `case_${Date.now()}`,
      artifacts: previousChatCase.artifacts || [],
      narrative: {
        text: previousChatCase.narrative?.text || previousChatCase.userMessage || '',
        themeHints: previousChatCase.narrative?.themeHints || []
      },
      benefits: {
        planType: previousChatCase.benefits?.planType || 'Other',
        network: previousChatCase.benefits?.network || 'Unknown',
        secondaryCoverage: previousChatCase.benefits?.secondaryCoverage || false
      }
    };

    // Process the follow-up query
    const chatAnswer = await chatEngine.processFollowUpQuery(message, chatCase);

    const response = {
      success: true,
      answer: chatAnswer.answer,
      confidence: chatAnswer.confidence.overall,
      sources: chatAnswer.sources,
      checklist: chatAnswer.checklist,
      phoneScripts: chatAnswer.phoneScripts,
      appealLetters: chatAnswer.appealLetters,
      keyFacts: chatAnswer.keyFacts,
      detections: chatAnswer.detections,
      metadata: {
        conversationId,
        isFollowUp: true,
        caseId: chatAnswer.caseId,
        responseLength: chatAnswer.answer.length,
        citationCount: chatAnswer.sources.length
      },
      processedAt: new Date().toISOString()
    };

    console.log(`Follow-up response generated (${chatAnswer.answer.length} chars, ${chatAnswer.confidence.overall.toFixed(2)} confidence)`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Chat follow-up processing failed:', error);

    return NextResponse.json(
      {
        error: 'Internal server error during follow-up processing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Chat Follow-up Endpoint',
    methods: ['POST'],
    maxMessageLength: 5000,
    description: 'Process follow-up questions about previously analyzed documents',
    features: [
      'Context-aware follow-up responses',
      'Reference to previous document analysis',
      'Maintains conversation continuity',
      'Detailed explanations of specific findings',
      'Actionable next steps based on analysis'
    ],
    usage: {
      message: 'Required: Follow-up question or request for clarification',
      previousChatCase: 'Required: Complete chat case from previous analysis',
      conversationId: 'Optional: ID to track conversation thread'
    },
    exampleQueries: [
      'Can you explain the duplicate charges you found?',
      'What should I do about the unbundling violations?',
      'How much money could I save from these issues?',
      'Which charges should I dispute first?',
      'Can you help me write an appeal letter?'
    ]
  });
}