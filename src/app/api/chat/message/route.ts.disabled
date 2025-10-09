import { NextRequest, NextResponse } from 'next/server';
import { UnifiedChatEngine } from '@/lib/chat/unified_chat';
import { BenefitsContext } from '@/types/chat';

const chatEngine = new UnifiedChatEngine();

export async function POST(request: NextRequest) {
  console.log('Processing chat message...');

  try {
    const body = await request.json();
    const { message, benefitsContext, conversationId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    if (message.length > 5000) {
      return NextResponse.json(
        { error: 'Message too long. Maximum length: 5000 characters' },
        { status: 400 }
      );
    }

    console.log(`Processing text query: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);

    // Parse benefits context if provided
    let parsedBenefitsContext: BenefitsContext | undefined;
    if (benefitsContext) {
      parsedBenefitsContext = {
        planType: benefitsContext.planType || 'Other',
        network: benefitsContext.network || 'Unknown',
        secondaryCoverage: benefitsContext.secondaryCoverage || false
      };
    }

    // Process the text query
    const chatAnswer = await chatEngine.processTextQuery(message, parsedBenefitsContext);

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
        caseId: chatAnswer.caseId,
        responseLength: chatAnswer.answer.length,
        citationCount: chatAnswer.sources.length
      },
      processedAt: new Date().toISOString()
    };

    console.log(`Chat response generated (${chatAnswer.answer.length} chars, ${chatAnswer.confidence.overall.toFixed(2)} confidence)`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Chat message processing failed:', error);

    return NextResponse.json(
      {
        error: 'Internal server error during chat processing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Chat Message Endpoint',
    methods: ['POST'],
    maxMessageLength: 5000,
    features: [
      'Healthcare billing Q&A',
      'Insurance terminology explanation',
      'Appeal guidance',
      'Balance billing protection info',
      'Medical necessity guidance',
      'Policy citations and references'
    ],
    exampleQueries: [
      'What is balance billing and how am I protected?',
      'How do I appeal a denied insurance claim?',
      'What\'s the difference between copay and coinsurance?',
      'What should I do if I receive a surprise medical bill?',
      'How do I dispute charges on my medical bill?'
    ]
  });
}