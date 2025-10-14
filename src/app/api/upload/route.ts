import { NextRequest, NextResponse } from 'next/server';
import busboy from 'busboy';
import { supabaseAdmin } from '@/lib/db';
import { performOCR } from '@/lib/ocr';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for OCR processing

// Helper to get client IP
function getClientIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for') ||
         request.headers.get('x-real-ip') ||
         'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type must be multipart/form-data' },
        { status: 400 }
      );
    }

    console.log('📤 Processing file upload...');

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const caseId = formData.get('caseId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!caseId) {
      return NextResponse.json(
        { error: 'No caseId provided' },
        { status: 400 }
      );
    }

    console.log(`📁 Processing file: ${file.name} (${file.size} bytes, ${file.type})`);

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not supported. Please upload JPEG, PNG, or PDF files.' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Store file in Supabase Storage
    const fileName = `${caseId}/${Date.now()}-${file.name}`;
    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from('wyng_cases')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (storageError) {
      console.error('Storage error:', storageError);
      return NextResponse.json(
        { error: 'Failed to store file' },
        { status: 500 }
      );
    }

    console.log(`💾 File stored: ${storageData.path}`);

    // Store file metadata in database
    const { data: fileData, error: fileError } = await supabaseAdmin
      .from('case_files')
      .insert({
        case_id: caseId,
        filename: file.name,
        mime: file.type,
        size_bytes: file.size,
        storage_path: storageData.path
      })
      .select('id')
      .single();

    if (fileError) {
      console.error('Database error:', fileError);
      return NextResponse.json(
        { error: 'Failed to save file metadata' },
        { status: 500 }
      );
    }

    const fileId = fileData.id;
    console.log(`📝 File metadata saved with ID: ${fileId}`);

    // Perform OCR
    let ocrResult;
    try {
      ocrResult = await performOCR(buffer, file.type);
      console.log(`🔍 OCR completed: ${ocrResult.text.length} characters extracted`);
    } catch (ocrError) {
      console.error('OCR error:', ocrError);
      // Continue without OCR - file is still uploaded
      ocrResult = { text: '', confidence: 0 };
    }

    // Update case status
    await supabaseAdmin
      .from('cases')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('case_id', caseId);

    return NextResponse.json({
      success: true,
      fileId: fileId,
      fileName: file.name,
      fileSize: file.size,
      ocrText: ocrResult.text,
      ocrConfidence: ocrResult.confidence,
      message: 'File uploaded and processed successfully'
    });

  } catch (error) {
    console.error('❌ Upload failed:', error);
    return NextResponse.json(
      {
        error: 'Upload failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
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