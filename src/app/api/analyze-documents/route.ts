import { NextRequest, NextResponse } from 'next/server';
import { ComprehensiveAnalyzer, AnalysisInput, validateDocumentBeforeProcessing, stripPHI } from '@/lib/comprehensive-analyzer';
import { BenefitsContext } from '@/types/analyzer';

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Starting document analysis request...');
    console.log('📊 Request headers:', Object.fromEntries(request.headers.entries()));

    // Check content length before processing
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      console.log(`📦 Request size: ${sizeInMB.toFixed(2)}MB`);

      if (sizeInMB > 50) { // 50MB total request limit
        return NextResponse.json(
          { error: 'Total request size exceeds 50MB limit. Please upload smaller files.' },
          { status: 413 }
        );
      }
    }

    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     '127.0.0.1';

    console.log(`🌐 Client IP: ${clientIP}`);

    // Parse form data with better error handling
    let formData: FormData;
    try {
      formData = await request.formData();
      console.log('✅ FormData parsed successfully');
    } catch (formError) {
      console.error('❌ Failed to parse FormData:', formError);
      return NextResponse.json(
        { error: 'Failed to parse uploaded data. Please check file sizes and try again.' },
        { status: 400 }
      );
    }

    // Extract email and description
    const email = formData.get('email') as string;
    const userDescription = formData.get('userDescription') as string || '';
    const benefitsString = formData.get('benefits') as string;

    if (!email) {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      );
    }

    // Parse benefits if provided
    let benefits: BenefitsContext | undefined;
    if (benefitsString) {
      try {
        benefits = JSON.parse(benefitsString) as BenefitsContext;
      } catch (error) {
        console.warn('Failed to parse benefits data:', error);
      }
    }

    // Extract files
    const files: Array<{ buffer: Buffer; filename: string; mimeType: string }> = [];
    let totalFileSize = 0;

    for (let i = 0; i < 10; i++) { // Support up to 10 files
      const fileKey = `file_${i}`;
      const file = formData.get(fileKey) as File | null;

      if (file && file instanceof File) {
        console.log(`📄 Processing file ${i}: ${file.name} (${file.type}, ${(file.size / 1024 / 1024).toFixed(2)}MB)`);

        // Check individual file size before processing
        if (file.size > 10 * 1024 * 1024) { // 10MB per file
          return NextResponse.json(
            { error: `File "${file.name}" exceeds 10MB limit. Please upload smaller files.` },
            { status: 413 }
          );
        }

        totalFileSize += file.size;

        // Check total file size
        if (totalFileSize > 50 * 1024 * 1024) { // 50MB total
          return NextResponse.json(
            { error: 'Total file size exceeds 50MB limit. Please upload fewer or smaller files.' },
            { status: 413 }
          );
        }

        try {
          // Validate file
          const buffer = Buffer.from(await file.arrayBuffer());
          const validation = validateDocumentBeforeProcessing(buffer, file.type);

          if (!validation.valid) {
            console.log(`❌ File validation failed for ${file.name}: ${validation.error}`);
            return NextResponse.json(
              { error: validation.error },
              { status: 400 }
            );
          }

          files.push({
            buffer,
            filename: file.name,
            mimeType: file.type
          });

          console.log(`✅ File ${file.name} processed successfully`);
        } catch (fileError) {
          console.error(`❌ Failed to process file ${file.name}:`, fileError);
          return NextResponse.json(
            { error: `Failed to process file "${file.name}". Please ensure it's not corrupted.` },
            { status: 400 }
          );
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No valid files uploaded' },
        { status: 400 }
      );
    }

    console.log(`📁 Processing ${files.length} files for ${email}`);

    // Prepare analysis input
    const analysisInput: AnalysisInput = {
      files,
      benefits,
      userEmail: email,
      userDescription: stripPHI(userDescription),
      clientIP
    };

    // Run analysis
    console.log('🤖 Initializing analyzer...');
    const analyzer = new ComprehensiveAnalyzer();

    console.log('📊 Running document analysis...');
    const result = await analyzer.analyzeDocuments(analysisInput);

    console.log('✅ Analysis completed successfully');

    // Strip any remaining PHI from the result before sending
    const sanitizedResult = {
      ...result,
      documentMeta: {
        ...result.documentMeta,
        // Remove potentially sensitive fields
        providerName: result.documentMeta.providerName ? '[PROVIDER NAME REDACTED]' : undefined,
        payer: result.documentMeta.payer ? '[PAYER NAME REDACTED]' : undefined
      }
    };

    return NextResponse.json(sanitizedResult);

  } catch (error) {
    console.error('❌ Document analysis failed:', error);

    // Determine error type and return appropriate response
    if (error instanceof Error) {
      if (error.message.includes('Rate limit exceeded')) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429 }
        );
      }

      if (error.message.includes('Failed to extract text')) {
        return NextResponse.json(
          { error: 'Unable to extract text from the uploaded documents. Please ensure they are clear and readable.' },
          { status: 400 }
        );
      }

      if (error.message.includes('Unsupported file type')) {
        return NextResponse.json(
          { error: 'Unsupported file type. Please upload PDF, JPEG, PNG, or WebP files.' },
          { status: 400 }
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