/**
 * OpenAI Vision OCR - Primary OCR engine with verbatim JSON prompts
 */

import OpenAI from 'openai';
import { OCRResult, OCRPageResult } from '@/lib/types/ocr';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * OCR result from OpenAI Vision with structured data
 */
export interface OpenAIVisionResult {
  doc_type: 'BILL' | 'EOB' | 'LETTER' | 'PORTAL' | 'INSURANCE_CARD' | 'UNKNOWN';
  header: {
    provider_name?: string;
    provider_npi?: string;
    payer?: string;
    claim_id?: string;
    account_id?: string;
    service_dates?: {
      start?: string;
      end?: string;
    };
    page: number;
    artifact_digest: string;
  };
  totals: {
    billed?: string;
    allowed?: string;
    plan_paid?: string;
    patient_resp?: string;
  };
  rows: Array<{
    code?: string;
    code_system?: 'CPT' | 'HCPCS' | 'REV' | 'POS' | null;
    modifiers?: string[] | null;
    description?: string | null;
    units?: number | null;
    dos?: string | null;
    pos?: string | null;
    rev_code?: string | null;
    npi?: string | null;
    charge?: string | null;
    allowed?: string | null;
    plan_paid?: string | null;
    patient_resp?: string | null;
  }>;
  keyfacts: {
    denial_reason?: string;
    carc_codes?: string[];
    rarc_codes?: string[];
    auth_or_referral?: string;
    claim_or_account_ref?: string;
  };
}

/**
 * Check if OpenAI API is available
 */
export function isOpenAIAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Process image with OpenAI Vision using verbatim JSON prompts
 */
export async function processImageWithOpenAI(
  imageBuffer: Buffer,
  mimeType: string,
  caseId: string,
  artifactId: string,
  pageNumber: number,
  artifactDigest: string,
  docTypeGuess: string = 'healthcare document'
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    console.log(`🤖 Starting OpenAI Vision OCR for page ${pageNumber}...`);

    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    // Create the verbatim JSON prompt
    const systemPrompt = "You are a verbatim OCR transcriber and structurer. Do not infer or guess. If a token is unclear, return null. Output strict JSON only.";

    const userPrompt = `You are reading a healthcare **${docTypeGuess}** image (case ${caseId}, artifact ${artifactId}, page ${pageNumber}, digest ${artifactDigest}).

Return strict JSON:
{
  "doc_type": "BILL"|"EOB"|"LETTER"|"PORTAL"|"INSURANCE_CARD"|"UNKNOWN",
  "header": {
     "provider_name"?:string, "provider_npi"?:string, "payer"?:string,
     "claim_id"?:string, "account_id"?:string,
     "service_dates"?: {"start"?:string,"end"?:string},
     "page": ${pageNumber},
     "artifact_digest": "${artifactDigest}"
  },
  "totals": { "billed"?:string, "allowed"?:string, "plan_paid"?:string, "patient_resp"?:string },
  "rows": [
     {
       "code"?:string, "code_system"?: "CPT"|"HCPCS"|"REV"|"POS"|null,
       "modifiers"?: string[]|null,
       "description"?:string|null,
       "units"?: number|null,
       "dos"?: string|null,
       "pos"?: string|null,
       "rev_code"?: string|null,
       "npi"?: string|null,
       "charge"?: string|null, "allowed"?: string|null, "plan_paid"?: string|null, "patient_resp"?: string|null
     }
  ],
  "keyfacts": { "denial_reason"?:string, "carc_codes"?:string[], "rarc_codes"?:string[], "auth_or_referral"?:string, "claim_or_account_ref"?:string }
}

Rules:
- Transcribe ONLY what is visible. No invented codes or amounts.
- A 'rows' entry represents a single visible service row with a money amount.
- For codes, return the exact token (e.g., '85025','80053','J7120','36415','02491','02492').
- Money: as printed, e.g., "$938.00".
- Dates exactly as printed (normalize later in code).`;

    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userPrompt
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('No content returned from OpenAI Vision');
    }

    // Parse JSON response
    let parsedResult: OpenAIVisionResult;
    try {
      parsedResult = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse OpenAI Vision JSON response:', content);
      throw new Error(`Invalid JSON response from OpenAI Vision: ${parseError}`);
    }

    // Validate required structure
    if (!parsedResult.doc_type || !parsedResult.header || !Array.isArray(parsedResult.rows)) {
      throw new Error('OpenAI Vision response missing required fields');
    }

    // Convert to OCRResult format
    const pages: OCRPageResult[] = [{
      pageNumber,
      text: content, // Store raw JSON for debugging
      confidence: 0.95, // OpenAI generally high confidence
      processingTimeMs: Date.now() - startTime,
      boundingBoxes: [], // OpenAI doesn't provide bounding boxes
      lines: [], // Extract from structured data if needed
      structuredData: parsedResult
    }];

    const processingTime = Date.now() - startTime;
    console.log(`✅ OpenAI Vision completed in ${processingTime}ms with ${parsedResult.rows.length} rows`);

    return {
      vendor: 'openai',
      pages,
      processingTimeMs: processingTime,
      success: true
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ OpenAI Vision failed after ${processingTime}ms:`, error);

    return {
      vendor: 'openai',
      pages: [],
      processingTimeMs: processingTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown OpenAI Vision error'
    };
  }
}

/**
 * Process PDF with OpenAI Vision by converting pages to images
 */
export async function processPdfWithOpenAI(
  pdfBuffer: Buffer,
  caseId: string,
  artifactId: string,
  artifactDigest: string
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    console.log(`🤖 Starting OpenAI Vision PDF OCR...`);

    // Convert PDF to images using PDF-lib or similar
    const pdfImages = await convertPdfToImages(pdfBuffer);

    const pages: OCRPageResult[] = [];

    for (let i = 0; i < pdfImages.length; i++) {
      const pageResult = await processImageWithOpenAI(
        pdfImages[i].buffer,
        'image/png',
        caseId,
        artifactId,
        i + 1,
        artifactDigest,
        'healthcare document'
      );

      if (pageResult.success && pageResult.pages.length > 0) {
        pages.push(...pageResult.pages);
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ OpenAI Vision PDF completed in ${processingTime}ms with ${pages.length} pages`);

    return {
      vendor: 'openai',
      pages,
      processingTimeMs: processingTime,
      success: pages.length > 0
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ OpenAI Vision PDF failed after ${processingTime}ms:`, error);

    return {
      vendor: 'openai',
      pages: [],
      processingTimeMs: processingTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown OpenAI Vision PDF error'
    };
  }
}

/**
 * Convert PDF to images for OpenAI Vision processing
 * Note: This is a placeholder - you'll need to implement PDF to image conversion
 */
async function convertPdfToImages(pdfBuffer: Buffer): Promise<Array<{ buffer: Buffer; pageNumber: number }>> {
  // TODO: Implement PDF to image conversion using pdf-poppler, pdf2pic, or similar
  // For now, throw an error to indicate this needs implementation
  throw new Error('PDF to image conversion not yet implemented for OpenAI Vision');
}

/**
 * Estimate document type from filename or content
 */
export function estimateDocumentType(filename: string, content?: string): string {
  const lowerFilename = filename.toLowerCase();

  if (lowerFilename.includes('eob') || lowerFilename.includes('explanation')) {
    return 'EOB';
  }

  if (lowerFilename.includes('bill') || lowerFilename.includes('invoice')) {
    return 'bill';
  }

  if (lowerFilename.includes('insurance') || lowerFilename.includes('card')) {
    return 'insurance card';
  }

  if (content) {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('explanation of benefits')) {
      return 'EOB';
    }
    if (lowerContent.includes('patient statement') || lowerContent.includes('billing statement')) {
      return 'bill';
    }
  }

  return 'healthcare document';
}