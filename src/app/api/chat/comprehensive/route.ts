import { NextRequest, NextResponse } from 'next/server';
import { UnifiedChatProcessor } from '@/lib/unified-chat-processor';
import { ThematicReasoner } from '@/lib/thematic-reasoner';
import { CommonIssueDetectors } from '@/lib/common-issue-detectors';
import { ChatAnswer, BenefitsContext } from '@/types/chat';
import { supabase } from '@/lib/db';

// Configuration
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

interface ComprehensiveChatRequest {
  narrative: string;
  benefits?: BenefitsContext;
  themeHints?: string[];
}

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Comprehensive chat API called');

    // Parse form data
    const formData = await request.formData();
    const narrative = formData.get('narrative') as string;
    const benefitsJson = formData.get('benefits') as string;
    const themeHintsJson = formData.get('themeHints') as string;

    if (!narrative) {
      return NextResponse.json(
        { error: 'Narrative is required' },
        { status: 400 }
      );
    }

    // Parse benefits and theme hints
    let benefits: BenefitsContext | undefined;
    let themeHints: string[] | undefined;

    try {
      if (benefitsJson) {
        benefits = JSON.parse(benefitsJson) as BenefitsContext;
      }
      if (themeHintsJson) {
        themeHints = JSON.parse(themeHintsJson) as string[];
      }
    } catch (parseError) {
      console.warn('Failed to parse benefits or theme hints:', parseError);
    }

    // Extract files from form data
    const files: Array<{ buffer: Buffer; filename: string; mimeType: string }> = [];
    const maxFiles = 10;

    for (let i = 0; i < maxFiles; i++) {
      const fileKey = `file_${i}`;
      const file = formData.get(fileKey) as File | null;

      if (file && file instanceof File) {
        // Validate file type
        const allowedTypes = [
          'application/pdf',
          'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
          'image/tiff', 'image/heic', 'image/heif', 'image/bmp',
          'text/plain'
        ];

        if (!allowedTypes.includes(file.type)) {
          return NextResponse.json(
            { error: `Unsupported file type: ${file.type}. Supported types: PDF, images (JPEG, PNG, WebP, TIFF, HEIC, BMP), and text files.` },
            { status: 400 }
          );
        }

        // Validate file size (15MB per file)
        const maxFileSize = 15 * 1024 * 1024;
        if (file.size > maxFileSize) {
          return NextResponse.json(
            { error: `File "${file.name}" exceeds 15MB limit` },
            { status: 413 }
          );
        }

        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          files.push({
            buffer,
            filename: file.name,
            mimeType: file.type
          });
          console.log(`📁 Added file: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)`);
        } catch (fileError) {
          console.error(`Failed to process file ${file.name}:`, fileError);
          return NextResponse.json(
            { error: `Failed to process file "${file.name}"` },
            { status: 400 }
          );
        }
      }
    }

    console.log(`📋 Processing comprehensive chat: ${files.length} files, narrative length: ${narrative.length}`);

    // Step 1: Process unified case with OCR and extraction
    const processor = new UnifiedChatProcessor();
    const context = await processor.processUnifiedCase(
      files,
      narrative,
      benefits,
      themeHints
    );

    // Step 2: Run common issue detections
    const detectors = new CommonIssueDetectors();
    const commonIssueDetections = await detectors.detectAllIssues(context);

    // Step 3: Merge detections into context
    const enhancedContext = {
      ...context,
      detections: commonIssueDetections
    };

    // Step 4: Generate comprehensive answer
    const reasoner = new ThematicReasoner();
    const answer: ChatAnswer = await reasoner.generateAnswer(enhancedContext);

    // Step 5: Store case in database for follow-ups
    try {
      const { error: dbError } = await supabase
        .from('chat_cases')
        .insert({
          case_id: answer.caseId,
          narrative,
          themes: context.themeClassification,
          artifacts_count: files.length,
          confidence_score: answer.confidence.overall,
          has_documents: files.length > 0,
          created_at: new Date().toISOString()
        });

      if (dbError) {
        console.warn('Failed to store case in database:', dbError);
      }
    } catch (dbError) {
      console.warn('Database operation failed:', dbError);
    }

    console.log(`✅ Comprehensive chat completed: ${answer.detections?.length || 0} detections, ${answer.sources.length} citations, confidence: ${answer.confidence.overall}%`);

    return NextResponse.json(answer);

  } catch (error) {
    console.error('❌ Comprehensive chat failed:', error);

    // Determine error type and return appropriate response
    if (error instanceof Error) {
      if (error.message.includes('OCR failed')) {
        return NextResponse.json(
          { error: 'Unable to extract text from uploaded documents. Please ensure files are clear and readable.' },
          { status: 400 }
        );
      }

      if (error.message.includes('Unsupported file')) {
        return NextResponse.json(
          { error: 'Unsupported file type. Please upload PDF, images, or text files.' },
          { status: 400 }
        );
      }

      if (error.message.includes('timeout') || error.message.includes('timeout')) {
        return NextResponse.json(
          { error: 'Processing timeout. Please try with fewer or smaller files.' },
          { status: 408 }
        );
      }
    }

    // Generic server error
    return NextResponse.json(
      { error: 'Analysis failed. Please try again or contact support if the problem persists.' },
      { status: 500 }
    );
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