import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { DualVendorOCRPipeline } from '@/lib/dual-vendor-ocr';

// Environment validation
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error('Missing Supabase configuration');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// Route configuration
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

// File validation
function validateDocumentBeforeProcessing(buffer: Buffer, mimeType: string): { valid: boolean; error?: string } {
  if (buffer.length === 0) {
    return { valid: false, error: 'File is empty' };
  }

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/heic'];
  if (!allowedTypes.includes(mimeType)) {
    return { valid: false, error: 'Unsupported file type. Please upload PDF, JPEG, PNG, WebP, TIFF, or HEIC files.' };
  }

  // 20MB file size limit
  const maxFileSize = 20 * 1024 * 1024;
  if (buffer.length > maxFileSize) {
    return { valid: false, error: 'File exceeds 20MB limit' };
  }

  return { valid: true };
}

// Hash email for privacy
function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Starting dual-vendor OCR ingest...');

    // Parse form data
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const files: Array<{ buffer: Buffer; filename: string; mimeType: string }> = [];

    if (!email) {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      );
    }

    // Extract files
    let totalFileSize = 0;
    const maxTotalSize = 100 * 1024 * 1024; // 100MB total

    for (let i = 0; i < 10; i++) {
      const fileKey = `file_${i}`;
      const file = formData.get(fileKey) as File | null;

      if (file && file instanceof File) {
        totalFileSize += file.size;

        if (totalFileSize > maxTotalSize) {
          return NextResponse.json(
            { error: 'Total file size exceeds 100MB limit' },
            { status: 413 }
          );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const validation = validateDocumentBeforeProcessing(buffer, file.type);

        if (!validation.valid) {
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
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No valid files uploaded' },
        { status: 400 }
      );
    }

    console.log(`📁 Processing ${files.length} files for dual-vendor OCR`);

    // Create case and artifacts in database
    const caseId = uuidv4();
    const emailHash = hashEmail(email);

    // Insert case
    const { error: caseError } = await supabase
      .from('ocr_cases')
      .insert([{
        case_id: caseId,
        email_hash: emailHash,
        source: 'wynglite'
      }]);

    if (caseError) {
      console.error('❌ Failed to create case:', caseError);
      return NextResponse.json(
        { error: 'Failed to create case' },
        { status: 500 }
      );
    }

    console.log(`🔗 Created case: ${caseId}`);

    // Process each file with dual-vendor OCR
    const pipeline = new DualVendorOCRPipeline();
    const artifactIds: string[] = [];
    let totalPages = 0;

    for (const file of files) {
      try {
        const artifactId = uuidv4();
        const artifactDigest = crypto.createHash('sha256').update(file.buffer).digest('hex');

        console.log(`🔍 Processing ${file.filename} with dual-vendor OCR`);

        // Insert artifact record
        const { error: artifactError } = await supabase
          .from('ocr_artifacts')
          .insert([{
            artifact_id: artifactId,
            case_id: caseId,
            artifact_digest: artifactDigest,
            filename: file.filename,
            mime: file.mimeType,
            pages: 1, // For now, assume 1 page per image
            doc_type: 'UNKNOWN' // Will be determined by OCR
          }]);

        if (artifactError) {
          console.error('❌ Failed to create artifact:', artifactError);
          continue;
        }

        // Run dual-vendor OCR consensus
        const result = await pipeline.processDocument(
          file.buffer,
          file.filename,
          file.mimeType,
          caseId,
          artifactId
        );

        artifactIds.push(artifactId);
        totalPages += result.pages;

        console.log(`✅ Processed ${file.filename}: ${result.extractedRows.length} consensus rows`);

      } catch (fileError) {
        console.error(`❌ Failed to process ${file.filename}:`, fileError);
        // Continue with other files
      }
    }

    if (artifactIds.length === 0) {
      return NextResponse.json(
        { error: 'Failed to process any files' },
        { status: 500 }
      );
    }

    console.log(`✅ Dual-vendor OCR completed: ${artifactIds.length} artifacts, ${totalPages} pages`);

    return NextResponse.json({
      success: true,
      caseId,
      artifactIds,
      pages: totalPages,
      message: `Successfully processed ${artifactIds.length} files with dual-vendor OCR consensus`
    });

  } catch (error) {
    console.error('❌ OCR ingest failed:', error);

    if (error instanceof Error) {
      if (error.message.includes('Rate limit')) {
        return NextResponse.json(
          { error: 'OCR service rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }

      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: 'OCR service configuration error. Please contact support.' },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: 'OCR processing failed. Please try again or contact support if the problem persists.' },
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