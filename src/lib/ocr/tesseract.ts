/**
 * Tesseract.js fallback OCR implementation
 */

import Tesseract from 'tesseract.js';
import { OCRPageResult, OCRResult } from '@/lib/types/ocr';

/**
 * Process image buffer with Tesseract OCR
 */
export async function processWithTesseract(
  imageBuffer: Buffer,
  mimeType: string
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    // Initialize Tesseract worker
    const worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    // Set parameters for better accuracy on medical documents
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,/$-: ()',
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    });

    // Perform OCR
    const { data } = await worker.recognize(imageBuffer);

    // Terminate worker
    await worker.terminate();

    // Convert Tesseract result to our format
    const pages = extractPagesFromTesseractResult(data);
    const processingTimeMs = Date.now() - startTime;

    return {
      vendor: 'tesseract',
      pages,
      processingTimeMs,
      success: true,
    };
  } catch (error) {
    console.error('Tesseract OCR failed:', error);
    return {
      vendor: 'tesseract',
      pages: [],
      processingTimeMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process PDF with Tesseract (requires PDF to image conversion)
 */
export async function processPdfWithTesseract(
  pdfBuffer: Buffer
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    // For PDF processing with Tesseract, we would need to convert PDF to images first
    // This is a simplified implementation - in production, you might use pdf2pic or similar
    console.warn('PDF processing with Tesseract requires PDF-to-image conversion');

    // For now, return empty result
    return {
      vendor: 'tesseract',
      pages: [],
      processingTimeMs: Date.now() - startTime,
      success: false,
      error: 'PDF processing not implemented for Tesseract fallback',
    };
  } catch (error) {
    console.error('Tesseract PDF OCR failed:', error);
    return {
      vendor: 'tesseract',
      pages: [],
      processingTimeMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Convert Tesseract result to our OCRPageResult format
 */
function extractPagesFromTesseractResult(data: Tesseract.Page): OCRPageResult[] {
  const lines: OCRPageResult['lines'] = [];

  // Extract lines from Tesseract data
  if (data.lines) {
    for (const line of data.lines) {
      if (line.text.trim()) {
        const bbox = line.bbox
          ? [line.bbox.x0, line.bbox.y0, line.bbox.x1, line.bbox.y1] as [number, number, number, number]
          : undefined;

        lines.push({
          text: line.text.trim(),
          bbox,
          confidence: line.confidence / 100, // Convert to 0-1 range
        });
      }
    }
  }

  // Create single page result
  const pageResult: OCRPageResult = {
    pageNumber: 1,
    text: data.text || '',
    confidence: data.confidence / 100, // Convert to 0-1 range
    lines,
  };

  return [pageResult];
}

/**
 * Pre-process image to improve OCR accuracy
 */
export async function preprocessImageForTesseract(
  imageBuffer: Buffer
): Promise<Buffer> {
  try {
    // Basic preprocessing - in production, you might use sharp or canvas
    // For now, return the original buffer
    // Potential improvements:
    // - Deskew
    // - Denoise
    // - Contrast enhancement
    // - Binarization

    return imageBuffer;
  } catch (error) {
    console.warn('Image preprocessing failed, using original:', error);
    return imageBuffer;
  }
}

/**
 * Check if Tesseract is available
 */
export function isTesseractAvailable(): boolean {
  try {
    // Tesseract.js should always be available since it's a dependency
    return true;
  } catch {
    return false;
  }
}

/**
 * Get optimal Tesseract configuration for medical documents
 */
export function getMedicalDocumentConfig(): Record<string, any> {
  return {
    // Page segmentation mode - assume uniform block of text
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,

    // Character whitelist for medical billing documents
    tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,/$-:() ',

    // OCR Engine Mode - use LSTM only for better accuracy
    tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,

    // Preserve interword spaces
    preserve_interword_spaces: '1',

    // Minimum word confidence threshold
    tessedit_char_unblacklist: '',
  };
}