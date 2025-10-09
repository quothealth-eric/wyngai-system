import { NextRequest, NextResponse } from 'next/server';
import { UnifiedCaseProcessor, ProcessingInput } from '@/lib/unified-case-processor';
import { TableAwareExtractor } from '@/lib/table-aware-extraction';
import { CaseBindingManager } from '@/lib/case-binding';
import { BenefitsContext } from '@/types/analyzer';

// Validation function for documents
function validateDocumentBeforeProcessing(buffer: Buffer, mimeType: string): { valid: boolean; error?: string } {
  // Check file size
  if (buffer.length === 0) {
    return { valid: false, error: 'File is empty' };
  }

  // Check MIME type
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(mimeType)) {
    return { valid: false, error: 'Unsupported file type. Please upload PDF, JPEG, PNG, or WebP files.' };
  }

  return { valid: true };
}

// Function to strip PII from user input
function stripPHI(text: string): string {
  if (!text) return text;

  // Basic PII removal - remove patterns that look like SSN, DOB, etc.
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '[DATE REDACTED]')
    .replace(/\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, '[CARD REDACTED]');
}

// Route configuration for App Router
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Starting document analysis request...');
    console.log('📊 Request headers:', Object.fromEntries(request.headers.entries()));

    // Log content length for debugging (but don't reject based on this alone)
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      console.log(`📦 Total request size (including FormData overhead): ${sizeInMB.toFixed(2)}MB`);

      // Only reject if extremely large (FormData can add significant overhead)
      if (sizeInMB > 100) { // 100MB total request limit (accounting for FormData overhead)
        return NextResponse.json(
          { error: 'Request too large. Please upload fewer or smaller files.' },
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
        const fileSizeMB = file.size / 1024 / 1024;
        console.log(`📄 Processing file ${i}: ${file.name} (${file.type}, ${fileSizeMB.toFixed(2)}MB, ${file.size} bytes)`);

        // Check individual file size before processing (15MB = 15,728,640 bytes)
        const maxFileSize = 15 * 1024 * 1024;
        console.log(`🔍 File size check: ${file.size} bytes vs ${maxFileSize} bytes limit (${fileSizeMB.toFixed(2)}MB vs 15MB)`);

        if (file.size > maxFileSize) {
          console.log(`❌ File ${file.name} rejected: ${fileSizeMB.toFixed(2)}MB exceeds 15MB limit`);
          return NextResponse.json(
            { error: `File "${file.name}" (${fileSizeMB.toFixed(2)}MB) exceeds 15MB limit. Please upload smaller files.` },
            { status: 413 }
          );
        }

        console.log(`✅ File ${file.name} passed size validation: ${fileSizeMB.toFixed(2)}MB is within 15MB limit`);

        totalFileSize += file.size;
        const totalSizeMB = totalFileSize / 1024 / 1024;
        console.log(`📊 Total file size so far: ${totalSizeMB.toFixed(2)}MB (${totalFileSize} bytes)`);

        // Check total file size (75MB = 78,643,200 bytes)
        const maxTotalSize = 75 * 1024 * 1024;
        if (totalFileSize > maxTotalSize) {
          console.log(`❌ Total file size rejected: ${totalSizeMB.toFixed(2)}MB exceeds 75MB limit`);
          return NextResponse.json(
            { error: `Total file size (${totalSizeMB.toFixed(2)}MB) exceeds 75MB limit. Please upload fewer or smaller files.` },
            { status: 413 }
          );
        }

        try {
          // Validate file
          console.log(`🔄 Converting ${file.name} to buffer...`);
          const buffer = Buffer.from(await file.arrayBuffer());
          console.log(`✅ Buffer created: ${buffer.length} bytes`);

          console.log(`🔍 Running validation for ${file.name}...`);
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

    // 🔗 CASE BINDING: Create strict correlation for this upload session
    const caseBindingManager = CaseBindingManager.getInstance();

    // Generate case bindings for all files
    const caseBindings = files.map(file => {
      const fakeFile = new File([file.buffer], file.filename, { type: file.mimeType });
      const { caseId, artifactBinding } = caseBindingManager.createCaseBinding(fakeFile);
      caseBindingManager.setArtifactDigest(caseId, artifactBinding.artifactId, file.buffer);
      return { caseId, artifactBinding, file };
    });

    const mainCaseId = caseBindings[0]?.caseId || 'fallback-case';
    console.log(`🔗 Created case bindings for ${caseBindings.length} files under case ${mainCaseId}`);

    // Prepare processing input with case binding
    const processingInput: ProcessingInput = {
      files,
      benefits,
      userEmail: email,
      userDescription: stripPHI(userDescription),
      clientIP
    };

    // Run unified case processing with enhanced extraction
    console.log('🤖 Initializing unified case processor with table-aware extraction...');
    const processor = new UnifiedCaseProcessor();

    console.log('📊 Running comprehensive case analysis with validated CPT extraction...');
    const result = await processor.processCase(processingInput);

    console.log('✅ Analysis completed successfully');

    // 🔍 VALIDATION: Validate results against case bindings
    const isValidResult = caseBindings.every(binding =>
      caseBindingManager.isCaseActive(binding.caseId)
    );

    if (!isValidResult) {
      console.warn('⚠️ Invalid case binding detected - possible result corruption');
      return NextResponse.json(
        { error: 'Analysis validation failed. Please try uploading again.' },
        { status: 400 }
      );
    }

    // Strip any remaining PHI from the result before sending
    const sanitizedResult = {
      ...result,
      // Add case correlation metadata
      caseMetadata: {
        mainCaseId,
        artifactCount: caseBindings.length,
        extractionMethod: 'table-aware-validated',
        processingTimestamp: new Date().toISOString()
      },
      // Keep the structure but redact sensitive provider/payer info from documentMeta array
      documentMeta: result.documentMeta.map(doc => ({
        ...doc,
        // Remove potentially sensitive fields
        providerName: doc.providerName ? '[PROVIDER NAME REDACTED]' : undefined,
        payer: doc.payer ? '[PAYER NAME REDACTED]' : undefined
      }))
    };

    // 🧹 CLEANUP: Clear case data after successful processing
    caseBindings.forEach(binding => {
      caseBindingManager.updateBindingStatus(binding.caseId, binding.artifactBinding.artifactId, 'completed');
    });

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