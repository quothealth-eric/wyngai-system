/**
 * Enhanced OCR extraction orchestrator - OpenAI Vision first, GCV/Tesseract fallback
 * Replaces the existing extract.ts with comprehensive pipeline
 */

import { OCRResult, FileRef } from '@/lib/types/ocr';
import {
  processImageWithOpenAI,
  processPdfWithOpenAI,
  isOpenAIAvailable,
  estimateDocumentType
} from './openai-vision';
import { processImageWithVision, processPdfWithVision, isVisionAvailable } from './gcv';
import { processWithTesseract, preprocessImageForTesseract, isTesseractAvailable } from './tesseract';

/**
 * Extract text from a file using OpenAI Vision first, then GCV/Tesseract fallback
 */
export async function extractTextFromFileEnhanced(
  fileRef: FileRef,
  caseId: string,
  tempBucketName?: string
): Promise<OCRResult> {
  console.log(`🔍 Starting enhanced OCR extraction for file: ${fileRef.fileId} (${fileRef.mime})`);
  console.log(`🔍 File details:`, {
    fileId: fileRef.fileId,
    storagePath: fileRef.storagePath,
    mime: fileRef.mime,
    sizeBytes: fileRef.sizeBytes
  });

  try {
    // Download file from storage
    console.log(`📥 Downloading file from storage: ${fileRef.storagePath}`);
    const fileBuffer = await downloadFileFromStorage(fileRef);
    console.log(`✅ File downloaded successfully, buffer size: ${fileBuffer.length} bytes`);

    // Determine file type and estimate document type
    const isPdf = fileRef.mime === 'application/pdf';
    const isImage = fileRef.mime.startsWith('image/');
    const docTypeGuess = estimateDocumentType(fileRef.storagePath);

    if (!isPdf && !isImage) {
      throw new Error(`Unsupported file type for OCR: ${fileRef.mime}`);
    }

    // Generate artifact digest for tracking
    const artifactDigest = generateArtifactDigest(fileRef, fileBuffer);

    // Step 1: Try OpenAI Vision first (preferred)
    if (isOpenAIAvailable()) {
      console.log('🤖 Attempting OCR with OpenAI Vision (GPT-4o)...');

      let openAIResult: OCRResult;

      if (isPdf) {
        // Note: PDF processing with OpenAI requires conversion to images
        console.log('📄 PDF detected - OpenAI Vision requires image conversion (not yet implemented)');
        openAIResult = {
          vendor: 'openai',
          pages: [],
          processingTimeMs: 0,
          success: false,
          error: 'PDF to image conversion not implemented for OpenAI Vision'
        };
      } else if (isImage) {
        openAIResult = await processImageWithOpenAI(
          fileBuffer,
          fileRef.mime,
          caseId,
          fileRef.fileId,
          1,
          artifactDigest,
          docTypeGuess
        );
      } else {
        openAIResult = {
          vendor: 'openai',
          pages: [],
          processingTimeMs: 0,
          success: false,
          error: 'Unsupported file type for OpenAI Vision'
        };
      }

      // If OpenAI succeeded and returned meaningful structured content, use it
      if (openAIResult.success && hasValidStructuredData(openAIResult)) {
        console.log(`✅ OpenAI Vision succeeded: ${openAIResult.pages.length} pages, ${openAIResult.processingTimeMs}ms`);
        return openAIResult;
      }

      console.log('⚠️ OpenAI Vision failed or returned invalid data, falling back to Google Cloud Vision');
    } else {
      console.log('⚠️ OpenAI API not available, skipping to Google Cloud Vision');
    }

    // Step 2: Fallback to Google Cloud Vision
    if (isVisionAvailable()) {
      console.log('🔍 Attempting OCR with Google Cloud Vision...');

      let visionResult: OCRResult;

      if (isPdf && tempBucketName) {
        visionResult = await processPdfWithVision(fileBuffer, tempBucketName);
      } else if (isImage) {
        visionResult = await processImageWithVision(fileBuffer, fileRef.mime);
      } else {
        console.log('📄 PDF processing requires temp bucket, skipping Vision API');
        visionResult = {
          vendor: 'google',
          pages: [],
          processingTimeMs: 0,
          success: false,
          error: 'No temp bucket provided for PDF'
        };
      }

      // If Vision succeeded and returned meaningful content, use it
      if (visionResult.success && visionResult.pages.length > 0 && hasMeaningfulContent(visionResult)) {
        console.log(`✅ Google Cloud Vision succeeded: ${visionResult.pages.length} pages, ${visionResult.processingTimeMs}ms`);
        return visionResult;
      }

      console.log('⚠️ Google Cloud Vision failed or returned empty results, falling back to Tesseract');
    } else {
      console.log('⚠️ Google Cloud Vision not available, falling back to Tesseract');
    }

    // Step 3: Final fallback to Tesseract
    if (isTesseractAvailable()) {
      console.log('📝 Attempting OCR with Tesseract...');

      let tesseractResult: OCRResult;

      if (isImage) {
        // Preprocess image for better Tesseract accuracy
        const processedBuffer = await preprocessImageForTesseract(fileBuffer);
        tesseractResult = await processWithTesseract(processedBuffer, fileRef.mime);
      } else {
        // For PDFs, we'd need conversion to images first
        console.log('📄 PDF processing with Tesseract not fully implemented');
        tesseractResult = {
          vendor: 'tesseract',
          pages: [],
          processingTimeMs: 0,
          success: false,
          error: 'PDF not supported by Tesseract fallback'
        };
      }

      if (tesseractResult.success) {
        console.log(`✅ Tesseract succeeded: ${tesseractResult.pages.length} pages, ${tesseractResult.processingTimeMs}ms`);
        return tesseractResult;
      }

      console.log('❌ Tesseract also failed');
    }

    // All methods failed
    return {
      vendor: 'tesseract',
      pages: [],
      processingTimeMs: 0,
      success: false,
      error: 'All OCR methods failed (OpenAI Vision → Google Cloud Vision → Tesseract)',
    };

  } catch (error) {
    console.error('❌ Enhanced OCR extraction failed:', error);
    return {
      vendor: 'tesseract',
      pages: [],
      processingTimeMs: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract text from multiple files with enhanced pipeline
 */
export async function extractTextFromFilesEnhanced(
  fileRefs: FileRef[],
  caseId: string,
  tempBucketName?: string
): Promise<Record<string, OCRResult>> {
  const results: Record<string, OCRResult> = {};

  // Process files in parallel with concurrency limit
  const concurrencyLimit = 2; // Reduced for API rate limits
  const chunks = chunkArray(fileRefs, concurrencyLimit);

  for (const chunk of chunks) {
    const promises = chunk.map(async (fileRef) => {
      const result = await extractTextFromFileEnhanced(fileRef, caseId, tempBucketName);
      return { fileId: fileRef.fileId, result };
    });

    const chunkResults = await Promise.all(promises);

    for (const { fileId, result } of chunkResults) {
      results[fileId] = result;
    }
  }

  return results;
}

/**
 * Check if OpenAI Vision result contains valid structured data
 */
function hasValidStructuredData(result: OCRResult): boolean {
  if (!result.pages || result.pages.length === 0) return false;

  // Check if any page has structured data from OpenAI Vision
  for (const page of result.pages) {
    if (page.structuredData && page.structuredData.rows && Array.isArray(page.structuredData.rows)) {
      // Must have at least one row with a money amount to be valid
      const hasMoneyRows = page.structuredData.rows.some((row: any) =>
        row.charge || row.allowed || row.plan_paid || row.patient_resp
      );
      if (hasMoneyRows) return true;
    }
  }

  return false;
}

/**
 * Check if OCR result contains meaningful content (for non-OpenAI vendors)
 */
function hasMeaningfulContent(result: OCRResult): boolean {
  if (!result.pages || result.pages.length === 0) return false;

  // Check if any page has substantial text content
  for (const page of result.pages) {
    if (page.text && page.text.trim().length > 50) {
      // Look for medical billing indicators
      const text = page.text.toLowerCase();
      const medicalKeywords = [
        'patient', 'provider', 'cpt', 'hcpcs', 'diagnosis', 'procedure',
        'charge', 'amount', 'insurance', 'claim', 'eob', 'bill', 'service'
      ];

      const hasKeywords = medicalKeywords.some(keyword => text.includes(keyword));
      if (hasKeywords) return true;

      // Or if it has reasonable amount of text with numbers (likely a bill)
      const hasNumbers = /\d/.test(text);
      const hasReasonableLength = text.length > 100;
      if (hasNumbers && hasReasonableLength) return true;
    }
  }

  return false;
}

/**
 * Generate artifact digest for tracking
 */
function generateArtifactDigest(fileRef: FileRef, buffer: Buffer): string {
  // Create a simple hash of file metadata for tracking
  const crypto = require('crypto');
  const hash = crypto.createHash('md5');
  hash.update(buffer);
  hash.update(String(fileRef.fileId)); // Convert fileId to string
  hash.update(fileRef.storagePath);
  return hash.digest('hex').substring(0, 12);
}

/**
 * Download file from storage - reused from existing extract.ts
 */
async function downloadFileFromStorage(fileRef: FileRef): Promise<Buffer> {
  try {
    // Use Supabase Storage (same as upload)
    const { supabaseAdmin } = await import('@/lib/db');

    // Log the storage path for debugging
    console.log(`📁 Attempting to download file from Supabase Storage path: ${fileRef.storagePath}`);

    // Try to download from Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from('wyng_cases')
      .download(fileRef.storagePath);

    if (error) {
      console.log(`📁 Original Supabase path failed, trying alternate versions...`);

      // Try multiple variations of the file path
      const pathVariations = [];

      // If path has underscores, try with spaces
      if (fileRef.storagePath.includes('_')) {
        pathVariations.push(fileRef.storagePath.replace(/_/g, ' '));
      }

      // If path has spaces, try with underscores
      if (fileRef.storagePath.includes(' ')) {
        pathVariations.push(fileRef.storagePath.replace(/ /g, '_'));
      }

      // Try each variation
      for (const variation of pathVariations) {
        try {
          console.log(`📁 Trying Supabase path variation: ${variation}`);
          const { data: variationData, error: variationError } = await supabaseAdmin.storage
            .from('wyng_cases')
            .download(variation);

          if (!variationError && variationData) {
            console.log(`✅ Successfully downloaded with Supabase path: ${variation}`);
            return Buffer.from(await variationData.arrayBuffer());
          }
        } catch (variationError: any) {
          console.log(`❌ Failed with Supabase path: ${variation}`);
          continue;
        }
      }

      // If all variations failed, throw error
      console.error('Failed to download from Supabase Storage:', error);
      throw new Error(`Failed to download file from Supabase Storage: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from Supabase Storage');
    }

    // Convert Blob to Buffer
    const buffer = Buffer.from(await data.arrayBuffer());
    console.log(`✅ Successfully downloaded file from Supabase Storage: ${fileRef.storagePath}`);
    return buffer;

  } catch (error) {
    console.error('Failed to download file from storage:', error);
    throw new Error(`Failed to download file: ${fileRef.fileId}`);
  }
}

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}