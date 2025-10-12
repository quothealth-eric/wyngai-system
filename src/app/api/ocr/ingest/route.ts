import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ocrBuffer } from '@/lib/ocr/vision';
import { parseBillTextToLines } from '@/lib/ocr/normalize';
import { toPricedSummary } from '@/lib/ocr/parseBill';
import { runDetections } from '@/lib/analyzer/runDetections';

// Validate GCP environment variables
function validateGCPEnvironment() {
  const required = [
    'GCP_SA_KEY_B64',
    'GCP_PROJECT_ID',
    'GCS_UPLOAD_BUCKET',
    'GCS_OUTPUT_BUCKET'
  ];

  for (const envVar of required) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
}

// Route configuration for Google Cloud Vision OCR
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large PDF processing
export const dynamic = 'force-dynamic';

// File validation for Google Cloud Vision OCR
function validateDocumentBeforeProcessing(buffer: Buffer, mimeType: string): { valid: boolean; error?: string } {
  if (buffer.length === 0) {
    return { valid: false, error: 'File is empty' };
  }

  // Google Cloud Vision supported types
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'image/heic',
    'image/heif',
    'image/webp'
  ];

  if (!allowedTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `Unsupported file type: ${mimeType}. Please upload PDF, JPEG, PNG, TIFF, or HEIC files.`
    };
  }

  // 20MB file size limit per file
  const maxFileSize = 20 * 1024 * 1024;
  if (buffer.length > maxFileSize) {
    return { valid: false, error: 'File exceeds 20MB limit' };
  }

  return { valid: true };
}


export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Starting Google Cloud Vision OCR ingest...');

    // Validate GCP environment
    validateGCPEnvironment();

    const caseId = crypto.randomUUID();
    const files: Array<{ buffer: Buffer; filename: string; mimeType: string }> = [];

    // Parse form data using Next.js built-in FormData
    const formData = await request.formData();

    // Extract files from form data
    for (let i = 0; i < 10; i++) {
      const fileKey = `file_${i}`;
      const file = formData.get(fileKey) as File | null;

      if (file && file instanceof File) {
        const buffer = Buffer.from(await file.arrayBuffer());
        files.push({
          buffer,
          filename: file.name,
          mimeType: file.type
        });
      }
    }

    // Also try 'file' without index for single file uploads
    const singleFile = formData.get('file') as File | null;
    if (singleFile && singleFile instanceof File) {
      const buffer = Buffer.from(await singleFile.arrayBuffer());
      files.push({
        buffer,
        filename: singleFile.name,
        mimeType: singleFile.type
      });
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No valid files uploaded' },
        { status: 400 }
      );
    }

    console.log(`📁 Processing ${files.length} files with Google Cloud Vision OCR`);

    const results: any[] = [];

    // Process each file through the OCR pipeline
    for (const file of files) {
      try {
        // Validate file before processing
        const validation = validateDocumentBeforeProcessing(file.buffer, file.mimeType);
        if (!validation.valid) {
          results.push({
            filename: file.filename,
            error: validation.error
          });
          continue;
        }

        console.log(`🔍 Processing ${file.filename} (${file.mimeType}, ${file.buffer.length} bytes)`);

        // Step 1: Google Cloud Vision OCR
        const ocrResult = await ocrBuffer(file.buffer, file.filename, file.mimeType);

        // Step 2: Parse text into normalized line items
        const parsedLines = parseBillTextToLines(ocrResult.text);

        // Step 3: Convert to priced summary
        const pricedSummary = toPricedSummary(parsedLines);

        // Step 4: Run 18-rule detection engine
        const detections = await runDetections(pricedSummary);

        results.push({
          caseId,
          artifactId: ocrResult.artifactId,
          artifactDigest: ocrResult.artifactDigest,
          filename: file.filename,
          pages: ocrResult.pages,
          pricedSummary,
          detections
        });

        console.log(`✅ Processed ${file.filename}: ${parsedLines.length} line items, ${detections.length} detections`);

      } catch (fileError) {
        console.error(`❌ Failed to process ${file.filename}:`, fileError);
        results.push({
          filename: file.filename,
          error: fileError instanceof Error ? fileError.message : String(fileError)
        });
      }
    }

    console.log(`🏁 Google Cloud Vision OCR completed: ${results.length} files processed`);

    return NextResponse.json({
      caseId,
      results
    });

  } catch (error) {
    console.error('❌ Google Cloud Vision OCR ingest failed:', error);

    if (error instanceof Error) {
      if (error.message.includes('Rate limit')) {
        return NextResponse.json(
          { error: 'Google Cloud Vision API rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }

      if (error.message.includes('credentials') || error.message.includes('API key')) {
        return NextResponse.json(
          { error: 'Google Cloud Vision API configuration error. Please contact support.' },
          { status: 503 }
        );
      }

      if (error.message.includes('GCP_') || error.message.includes('GCS_')) {
        return NextResponse.json(
          { error: 'Google Cloud configuration missing. Please contact support.' },
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

// Handle preflight requests for CORS
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