/**
 * OCR extraction orchestrator - coordinates Google Vision and Tesseract fallback
 */

import { Storage } from '@google-cloud/storage';
import { OCRResult, FileRef } from '@/lib/types/ocr';
import { processImageWithVision, processPdfWithVision, isVisionAvailable } from './gcv';
import { processWithTesseract, preprocessImageForTesseract, isTesseractAvailable } from './tesseract';

/**
 * Extract text from a file using OCR with Google Vision primary and Tesseract fallback
 */
export async function extractTextFromFile(
  fileRef: FileRef,
  tempBucketName?: string
): Promise<OCRResult> {
  console.log(`Starting OCR extraction for file: ${fileRef.fileId} (${fileRef.mime})`);

  try {
    // Download file from storage
    const fileBuffer = await downloadFileFromStorage(fileRef);

    // Determine the best OCR approach based on file type
    const isPdf = fileRef.mime === 'application/pdf';
    const isImage = fileRef.mime.startsWith('image/');

    if (!isPdf && !isImage) {
      throw new Error(`Unsupported file type for OCR: ${fileRef.mime}`);
    }

    // Try Google Vision first if available
    if (isVisionAvailable()) {
      console.log('Attempting OCR with Google Cloud Vision...');

      let visionResult: OCRResult;

      if (isPdf && tempBucketName) {
        visionResult = await processPdfWithVision(fileBuffer, tempBucketName);
      } else if (isImage) {
        visionResult = await processImageWithVision(fileBuffer, fileRef.mime);
      } else {
        console.log('PDF processing requires temp bucket, skipping Vision API');
        visionResult = { vendor: 'google', pages: [], processingTimeMs: 0, success: false, error: 'No temp bucket provided for PDF' };
      }

      // If Vision succeeded and returned meaningful content, use it
      if (visionResult.success && visionResult.pages.length > 0 && hasmeaningfulContent(visionResult)) {
        console.log(`Google Vision succeeded: ${visionResult.pages.length} pages, ${visionResult.processingTimeMs}ms`);
        return visionResult;
      }

      console.log('Google Vision failed or returned empty results, falling back to Tesseract');
    } else {
      console.log('Google Vision not available, using Tesseract');
    }

    // Fallback to Tesseract
    if (isTesseractAvailable()) {
      console.log('Attempting OCR with Tesseract...');

      let tesseractResult: OCRResult;

      if (isImage) {
        // Preprocess image for better Tesseract accuracy
        const processedBuffer = await preprocessImageForTesseract(fileBuffer);
        tesseractResult = await processWithTesseract(processedBuffer, fileRef.mime);
      } else {
        // For PDFs, we'd need conversion to images first
        console.log('PDF processing with Tesseract not fully implemented');
        tesseractResult = { vendor: 'tesseract', pages: [], processingTimeMs: 0, success: false, error: 'PDF not supported by Tesseract fallback' };
      }

      if (tesseractResult.success) {
        console.log(`Tesseract succeeded: ${tesseractResult.pages.length} pages, ${tesseractResult.processingTimeMs}ms`);
        return tesseractResult;
      }

      console.log('Tesseract also failed');
    }

    // Both methods failed
    return {
      vendor: 'tesseract',
      pages: [],
      processingTimeMs: 0,
      success: false,
      error: 'All OCR methods failed',
    };

  } catch (error) {
    console.error('OCR extraction failed:', error);
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
 * Extract text from multiple files
 */
export async function extractTextFromFiles(
  fileRefs: FileRef[],
  tempBucketName?: string
): Promise<Record<string, OCRResult>> {
  const results: Record<string, OCRResult> = {};

  // Process files in parallel with concurrency limit
  const concurrencyLimit = 3;
  const chunks = chunkArray(fileRefs, concurrencyLimit);

  for (const chunk of chunks) {
    const promises = chunk.map(async (fileRef) => {
      const result = await extractTextFromFile(fileRef, tempBucketName);
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
 * Download file from storage
 */
async function downloadFileFromStorage(fileRef: FileRef): Promise<Buffer> {
  try {
    // For now, assume the file is stored in Google Cloud Storage
    // In production, this might need to handle different storage providers

    if (!process.env.STORAGE_BUCKET) {
      throw new Error('STORAGE_BUCKET not configured');
    }

    const storage = new Storage();
    const bucket = storage.bucket(process.env.STORAGE_BUCKET);
    const file = bucket.file(fileRef.storagePath);

    const [buffer] = await file.download();
    return buffer;

  } catch (error) {
    console.error('Failed to download file from storage:', error);
    throw new Error(`Failed to download file: ${fileRef.fileId}`);
  }
}

/**
 * Check if OCR result contains meaningful content
 */
function hasmeaningfulContent(result: OCRResult): boolean {
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
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Validate OCR results for quality
 */
export function validateOCRResults(results: Record<string, OCRResult>): {
  valid: string[];
  invalid: string[];
  warnings: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  const warnings: string[] = [];

  for (const [fileId, result] of Object.entries(results)) {
    if (!result.success) {
      invalid.push(fileId);
      continue;
    }

    if (!hasmeaningfulContent(result)) {
      warnings.push(`File ${fileId} has minimal content detected`);
    }

    // Check confidence levels
    const lowConfidencePages = result.pages.filter(page => page.confidence < 0.7);
    if (lowConfidencePages.length > 0) {
      warnings.push(`File ${fileId} has ${lowConfidencePages.length} pages with low confidence`);
    }

    valid.push(fileId);
  }

  return { valid, invalid, warnings };
}

/**
 * Get OCR processing statistics
 */
export function getOCRStats(results: Record<string, OCRResult>): {
  totalFiles: number;
  successfulFiles: number;
  totalPages: number;
  totalProcessingTime: number;
  avgConfidence: number;
  vendorBreakdown: Record<string, number>;
} {
  const stats = {
    totalFiles: Object.keys(results).length,
    successfulFiles: 0,
    totalPages: 0,
    totalProcessingTime: 0,
    avgConfidence: 0,
    vendorBreakdown: {} as Record<string, number>,
  };

  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const result of Object.values(results)) {
    if (result.success) {
      stats.successfulFiles++;
    }

    stats.totalPages += result.pages.length;
    stats.totalProcessingTime += result.processingTimeMs;

    // Track vendor usage
    stats.vendorBreakdown[result.vendor] = (stats.vendorBreakdown[result.vendor] || 0) + 1;

    // Calculate average confidence
    for (const page of result.pages) {
      totalConfidence += page.confidence;
      confidenceCount++;
    }
  }

  if (confidenceCount > 0) {
    stats.avgConfidence = totalConfidence / confidenceCount;
  }

  return stats;
}