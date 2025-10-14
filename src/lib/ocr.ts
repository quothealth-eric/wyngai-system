import { ImageAnnotatorClient } from '@google-cloud/vision';

interface OCRResult {
  text: string;
  confidence: number;
  pages?: number;
}

// Initialize Google Cloud Vision client
const vision = new ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

/**
 * Perform OCR on image or PDF buffer using Google Cloud Vision
 */
export async function performOCR(buffer: Buffer, mimeType: string): Promise<OCRResult> {
  try {
    console.log(`🔍 Starting OCR for ${mimeType} file (${buffer.length} bytes)`);

    // For PDF files, use document text detection
    if (mimeType === 'application/pdf') {
      const [result] = await vision.documentTextDetection({
        image: {
          content: buffer.toString('base64'),
        },
      });

      const fullTextAnnotation = result.fullTextAnnotation;
      if (!fullTextAnnotation || !fullTextAnnotation.text) {
        console.warn('⚠️  No text found in PDF');
        return { text: '', confidence: 0 };
      }

      // Calculate average confidence from all words
      const words = fullTextAnnotation.pages?.[0]?.blocks
        ?.flatMap(block => block.paragraphs || [])
        ?.flatMap(paragraph => paragraph.words || []) || [];

      const confidences = words
        .map(word => word.confidence || 0)
        .filter(conf => conf > 0);

      const avgConfidence = confidences.length > 0
        ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length
        : 0.85;

      console.log(`✅ PDF OCR complete: ${fullTextAnnotation.text.length} characters, ${Math.round(avgConfidence * 100)}% confidence`);

      return {
        text: fullTextAnnotation.text,
        confidence: Math.round(avgConfidence * 100),
        pages: fullTextAnnotation.pages?.length || 1
      };
    }

    // For images, use regular text detection
    const [result] = await vision.textDetection({
      image: {
        content: buffer.toString('base64'),
      },
    });

    const detections = result.textAnnotations || [];
    if (detections.length === 0) {
      console.warn('⚠️  No text found in image');
      return { text: '', confidence: 0 };
    }

    // First annotation contains full text
    const fullText = detections[0].description || '';

    // Calculate confidence from bounding polygon data
    const confidence = detections[0].boundingPoly ? 85 : 75; // Rough estimation

    console.log(`✅ Image OCR complete: ${fullText.length} characters, ${confidence}% confidence`);

    return {
      text: fullText,
      confidence: confidence,
      pages: 1
    };

  } catch (error) {
    console.error('❌ OCR failed:', error);
    throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fallback OCR using Tesseract.js for when Google Vision is unavailable
 */
export async function performLocalOCR(buffer: Buffer, mimeType: string): Promise<OCRResult> {
  try {
    // Dynamic import to avoid build issues
    const Tesseract = await import('tesseract.js');

    console.log(`🔍 Starting local OCR for ${mimeType} file`);

    const { data } = await Tesseract.recognize(buffer, 'eng', {
      logger: m => console.log('Tesseract:', m)
    });

    console.log(`✅ Local OCR complete: ${data.text.length} characters, ${data.confidence}% confidence`);

    return {
      text: data.text,
      confidence: Math.round(data.confidence),
      pages: 1
    };
  } catch (error) {
    console.error('❌ Local OCR failed:', error);
    throw new Error(`Local OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}