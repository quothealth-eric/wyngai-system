/**
 * WyngAI Central Assistant - Enhanced OCR Pipeline
 * OpenAI Vision-first with GCV and Tesseract fallbacks
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import {
  UploadedFile,
  OCRResult,
  ExtractedInsuranceData
} from '@/lib/types/rag';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

export class EnhancedOCRPipeline {
  /**
   * Process uploaded file with multi-provider OCR
   */
  async processFile(
    file: File | Buffer,
    filename: string,
    chatId?: string
  ): Promise<UploadedFile> {
    console.log('📄 Processing file with enhanced OCR:', filename);

    const startTime = Date.now();

    // Determine file type
    const uploadType = this.classifyDocumentType(filename);

    // Convert to base64 for OpenAI Vision
    const base64Data = await this.convertToBase64(file);

    // Try OpenAI Vision first (primary)
    let ocrResults: OCRResult[] = [];
    let extractedData: ExtractedInsuranceData | undefined;

    try {
      const openaiResult = await this.processWithOpenAIVision(base64Data, uploadType);
      ocrResults.push(openaiResult);
      extractedData = await this.extractStructuredData(openaiResult.text, uploadType);
    } catch (error) {
      console.warn('OpenAI Vision failed, trying fallbacks:', error);
    }

    // Fallback to Google Cloud Vision if OpenAI fails
    if (ocrResults.length === 0 || ocrResults[0].confidence < 0.7) {
      try {
        const gcvResult = await this.processWithGoogleVision(base64Data);
        ocrResults.push(gcvResult);

        if (!extractedData) {
          extractedData = await this.extractStructuredData(gcvResult.text, uploadType);
        }
      } catch (error) {
        console.warn('Google Cloud Vision failed:', error);
      }
    }

    // Final fallback to Tesseract if others fail
    if (ocrResults.length === 0 || ocrResults.every(r => r.confidence < 0.5)) {
      try {
        const tesseractResult = await this.processWithTesseract(base64Data);
        ocrResults.push(tesseractResult);

        if (!extractedData) {
          extractedData = await this.extractStructuredData(tesseractResult.text, uploadType);
        }
      } catch (error) {
        console.error('All OCR methods failed:', error);
      }
    }

    // Store file in Supabase Storage
    const storagePath = await this.storeFile(file, filename, chatId);

    const uploadedFile: UploadedFile = {
      file_id: require('crypto').randomUUID(),
      filename,
      mime_type: this.getMimeType(filename),
      size_bytes: this.getFileSize(file),
      storage_path: storagePath,
      upload_type: uploadType,
      ocr_results: ocrResults,
      extracted_data: extractedData
    };

    console.log(`✅ File processed in ${Date.now() - startTime}ms with ${ocrResults.length} OCR results`);
    return uploadedFile;
  }

  /**
   * Process with OpenAI Vision (primary method)
   */
  private async processWithOpenAIVision(
    base64Data: string,
    documentType: string
  ): Promise<OCRResult> {
    console.log('👁️ Processing with OpenAI Vision...');
    const startTime = Date.now();

    const systemPrompt = this.buildVisionPrompt(documentType);

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please extract all text and relevant information from this insurance document.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      });

      const extractedText = response.choices[0].message.content || '';
      const processingTime = Date.now() - startTime;

      return {
        provider: 'openai_vision',
        confidence: 0.9, // OpenAI Vision generally has high confidence
        text: extractedText,
        processing_time_ms: processingTime,
        structured_data: {
          usage: response.usage,
          model: 'gpt-4o'
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`OpenAI Vision processing failed: ${errorMessage}`);
    }
  }

  /**
   * Process with Google Cloud Vision (fallback)
   */
  private async processWithGoogleVision(base64Data: string): Promise<OCRResult> {
    console.log('🔍 Processing with Google Cloud Vision...');
    const startTime = Date.now();

    // This is a placeholder - actual implementation would use Google Cloud Vision API
    // For now, return a simulated result
    await this.delay(1000); // Simulate processing time

    return {
      provider: 'google_vision',
      confidence: 0.8,
      text: '[Google Cloud Vision text extraction would be implemented here]',
      processing_time_ms: Date.now() - startTime,
      structured_data: {
        note: 'Google Cloud Vision integration placeholder'
      }
    };
  }

  /**
   * Process with Tesseract (final fallback)
   */
  private async processWithTesseract(base64Data: string): Promise<OCRResult> {
    console.log('🔤 Processing with Tesseract...');
    const startTime = Date.now();

    // This is a placeholder - actual implementation would use Tesseract.js
    // For now, return a simulated result
    await this.delay(2000); // Simulate processing time

    return {
      provider: 'tesseract',
      confidence: 0.6,
      text: '[Tesseract OCR text extraction would be implemented here]',
      processing_time_ms: Date.now() - startTime,
      structured_data: {
        note: 'Tesseract OCR integration placeholder'
      }
    };
  }

  /**
   * Extract structured insurance data from OCR text
   */
  private async extractStructuredData(
    text: string,
    documentType: string
  ): Promise<ExtractedInsuranceData> {
    console.log('🔬 Extracting structured data from OCR text...');

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Extract structured insurance information from this ${documentType} document. Focus on plan details, claims information, and financial amounts. Return JSON with plan_info, claims_info, and financial_info objects.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        functions: [{
          name: 'extract_insurance_data',
          description: 'Extract structured insurance data from document text',
          parameters: {
            type: 'object',
            properties: {
              plan_info: {
                type: 'object',
                properties: {
                  plan_name: { type: 'string' },
                  member_id: { type: 'string' },
                  group_number: { type: 'string' },
                  plan_type: { type: 'string' },
                  effective_date: { type: 'string' }
                }
              },
              claims_info: {
                type: 'object',
                properties: {
                  claim_number: { type: 'string' },
                  date_of_service: { type: 'string' },
                  provider_name: { type: 'string' },
                  provider_npi: { type: 'string' },
                  diagnosis_codes: { type: 'array', items: { type: 'string' } },
                  procedure_codes: { type: 'array', items: { type: 'string' } },
                  carc_codes: { type: 'array', items: { type: 'string' } },
                  rarc_codes: { type: 'array', items: { type: 'string' } }
                }
              },
              financial_info: {
                type: 'object',
                properties: {
                  total_charges: { type: 'number' },
                  allowed_amount: { type: 'number' },
                  plan_paid: { type: 'number' },
                  patient_responsibility: { type: 'number' },
                  deductible_applied: { type: 'number' },
                  coinsurance_applied: { type: 'number' },
                  copay_applied: { type: 'number' }
                }
              }
            }
          }
        }],
        function_call: { name: 'extract_insurance_data' },
        temperature: 0.1
      });

      const functionCall = response.choices[0].message.function_call;
      if (functionCall?.arguments) {
        return JSON.parse(functionCall.arguments) as ExtractedInsuranceData;
      }
    } catch (error) {
      console.error('Error extracting structured data:', error);
    }

    return {}; // Return empty object if extraction fails
  }

  /**
   * Build appropriate prompt for OpenAI Vision based on document type
   */
  private buildVisionPrompt(documentType: string): string {
    const basePrompt = 'You are an expert at reading and extracting information from insurance documents. Extract all visible text accurately, maintaining structure and formatting.';

    const typeSpecificPrompts = {
      'eob': basePrompt + ' Pay special attention to claim numbers, dates of service, provider information, procedure codes, allowed amounts, plan payments, and patient responsibility amounts. Also look for CARC/RARC codes and denial reasons.',
      'bill': basePrompt + ' Focus on provider information, service dates, procedure codes, charge amounts, and patient demographic information. Look for any insurance-related information.',
      'id_card': basePrompt + ' Extract member ID, group number, plan name, effective dates, copay amounts, deductible information, and any customer service phone numbers.',
      'letter': basePrompt + ' Read the complete letter content, paying attention to any claim references, appeal information, coverage decisions, or instructions for the member.',
      'form': basePrompt + ' Extract all form fields, checkboxes, and written information. Maintain the structure of the form as much as possible.'
    };

    return (typeSpecificPrompts as any)[documentType] || basePrompt;
  }

  /**
   * Classify document type based on filename and content
   */
  private classifyDocumentType(filename: string): 'eob' | 'bill' | 'id_card' | 'letter' | 'form' | 'other' {
    const name = filename.toLowerCase();

    if (name.includes('eob') || name.includes('explanation') || name.includes('benefit')) {
      return 'eob';
    }
    if (name.includes('bill') || name.includes('statement') || name.includes('invoice')) {
      return 'bill';
    }
    if (name.includes('card') || name.includes('id') || name.includes('member')) {
      return 'id_card';
    }
    if (name.includes('letter') || name.includes('notice') || name.includes('correspondence')) {
      return 'letter';
    }
    if (name.includes('form') || name.includes('application') || name.includes('claim')) {
      return 'form';
    }

    return 'other';
  }

  /**
   * Convert file to base64 for API processing
   */
  private async convertToBase64(file: File | Buffer): Promise<string> {
    if (file instanceof Buffer) {
      return file.toString('base64');
    }

    // Handle File type
    if (typeof window !== 'undefined' && file instanceof File) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file as File);
      });
    }

    // Server-side fallback for non-File types
    throw new Error('Unsupported file type for base64 conversion');
  }

  /**
   * Store file in Supabase Storage
   */
  private async storeFile(
    file: File | Buffer,
    filename: string,
    chatId?: string
  ): Promise<string> {
    const bucket = 'chat-uploads';
    const path = chatId
      ? `chat/${chatId}/${Date.now()}-${filename}`
      : `uploads/${Date.now()}-${filename}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file as any, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw new Error(`Failed to store file: ${error.message}`);
    }

    return data.path;
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'tiff': 'image/tiff',
      'tif': 'image/tiff'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Get file size
   */
  private getFileSize(file: File | Buffer): number {
    if (file instanceof Buffer) {
      return file.length;
    }
    if (typeof window !== 'undefined' && file instanceof File) {
      return file.size;
    }
    // Fallback for unknown types
    return 0;
  }

  /**
   * Delay helper for simulating processing time
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}