import { ImageAnnotatorClient } from '@google-cloud/vision';
import OpenAI from 'openai';

interface OCRResult {
  text: string;
  confidence: number;
  pages?: number;
}

// Initialize clients
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const vision = process.env.GOOGLE_APPLICATION_CREDENTIALS ? new ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
}) : null;

/**
 * OpenAI-first OCR with GCV and Tesseract fallbacks
 */
export async function performOCR(buffer: Buffer, mimeType: string): Promise<OCRResult> {
  console.log(`🔍 Starting OpenAI-first OCR for ${mimeType} file (${buffer.length} bytes)`);

  // Try OpenAI first (as requested)
  if (openai && (mimeType.startsWith('image/') || mimeType === 'application/pdf')) {
    try {
      console.log('🤖 Attempting OpenAI Vision API...');
      const result = await performOpenAIOCR(buffer, mimeType);
      console.log(`✅ OpenAI OCR successful: ${result.text.length} characters`);
      return result;
    } catch (openaiError) {
      console.warn('⚠️ OpenAI OCR failed, trying Google Cloud Vision fallback:', openaiError);
    }
  } else {
    console.log('⚠️ OpenAI not available, trying Google Cloud Vision...');
  }

  // Try Google Cloud Vision as fallback
  if (vision) {
    try {
      console.log('🔍 Attempting Google Cloud Vision fallback...');
      const result = await performGoogleOCR(buffer, mimeType);
      console.log(`✅ Google Vision OCR successful: ${result.text.length} characters`);
      return result;
    } catch (gvError) {
      console.warn('⚠️ Google Vision OCR failed, trying Tesseract fallback:', gvError);
    }
  } else {
    console.log('⚠️ Google Cloud Vision not configured, trying Tesseract...');
  }

  // Final fallback to Tesseract
  try {
    console.log('🔍 Attempting Tesseract fallback...');
    const result = await performLocalOCR(buffer, mimeType);
    console.log(`✅ Tesseract OCR successful: ${result.text.length} characters`);
    return result;
  } catch (tesseractError) {
    console.error('❌ All OCR methods failed');
    throw new Error(`OCR processing failed: All methods exhausted. Last error: ${tesseractError instanceof Error ? tesseractError.message : 'Unknown error'}`);
  }
}

/**
 * OpenAI Vision API OCR
 */
async function performOpenAIOCR(buffer: Buffer, mimeType: string): Promise<OCRResult> {
  if (!openai) {
    throw new Error('OpenAI client not initialized');
  }

  try {
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all text from this document/image. Return only the extracted text, nothing else. Preserve formatting and line breaks where possible.'
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.1,
    });

    const extractedText = response.choices[0]?.message?.content || '';

    if (!extractedText.trim()) {
      throw new Error('No text extracted by OpenAI');
    }

    return {
      text: extractedText.trim(),
      confidence: 90, // OpenAI typically has high accuracy
      pages: 1
    };
  } catch (error) {
    console.error('OpenAI OCR error:', error);
    throw error;
  }
}

/**
 * Google Cloud Vision OCR (fallback)
 */
async function performGoogleOCR(buffer: Buffer, mimeType: string): Promise<OCRResult> {
  if (!vision) {
    throw new Error('Google Cloud Vision client not initialized');
  }
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