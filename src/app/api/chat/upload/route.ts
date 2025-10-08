import { NextRequest, NextResponse } from 'next/server';
import { UnifiedChatEngine } from '@/lib/chat/unified_chat';
import { BenefitsContext } from '@/types/chat';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tiff',
  'image/webp'
];

const chatEngine = new UnifiedChatEngine();

export async function POST(request: NextRequest) {
  console.log('Processing chat image upload...');

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const message = formData.get('message') as string;
    const benefitsContextStr = formData.get('benefitsContext') as string;
    const conversationId = formData.get('conversationId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported types: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    console.log(`Processing upload: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)`);
    if (message) {
      console.log(`With message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse benefits context if provided
    let benefitsContext: BenefitsContext | undefined;
    if (benefitsContextStr) {
      try {
        const parsed = JSON.parse(benefitsContextStr);
        benefitsContext = {
          planType: parsed.planType || 'Other',
          network: parsed.network || 'Unknown',
          secondaryCoverage: parsed.secondaryCoverage || false
        };
      } catch (parseError) {
        console.warn('Failed to parse benefits context:', parseError);
      }
    }

    // Process the image upload with chat integration
    const chatAnswer = await chatEngine.processImageUpload(
      buffer,
      file.name,
      file.type,
      message || undefined,
      benefitsContext
    );

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
        filename: file.name,
        fileSize: file.size,
        fileType: file.type,
        responseLength: chatAnswer.answer.length,
        citationCount: chatAnswer.sources.length
      },
      processedAt: new Date().toISOString()
    };

    console.log(`Chat image analysis complete (${chatAnswer.answer.length} chars, ${chatAnswer.confidence.overall.toFixed(2)} confidence)`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Chat image upload failed:', error);

    return NextResponse.json(
      {
        error: 'Internal server error during image analysis',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Chat Image Upload Endpoint',
    methods: ['POST'],
    maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
    supportedTypes: ALLOWED_TYPES,
    features: [
      'Image-aware chat analysis',
      'Document upload with Q&A',
      'Comprehensive bill analysis',
      'Conversational bill explanation',
      'Follow-up question support',
      'Policy citations and guidance'
    ],
    usage: {
      file: 'Required: Medical document (PDF, image)',
      message: 'Optional: Question about the document',
      benefitsContext: 'Optional: JSON string with insurance information',
      conversationId: 'Optional: ID to track conversation'
    }
  });
}