import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/db'

// Conditionally import Google Cloud Vision to prevent build issues
let ImageAnnotatorClient: any = null
try {
  ImageAnnotatorClient = require('@google-cloud/vision').ImageAnnotatorClient
} catch (error) {
  console.log('Google Cloud Vision not available in this environment')
}

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 20000,
  maxRetries: 0
})

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 18000,
  maxRetries: 0
})

// Google Cloud Vision client (requires service account)
let googleVision: any = null
try {
  if (ImageAnnotatorClient && process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_CLOUD_PRIVATE_KEY) {
    googleVision = new ImageAnnotatorClient({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    })
  }
} catch (error) {
  console.log('Google Cloud Vision not configured, using AI-based OCR only')
}

export interface LineItem {
  line_number: number
  cpt_code: string | null
  code_description: string | null
  modifier_codes: string[] | null
  service_date: string | null
  place_of_service: string | null
  provider_npi: string | null
  units: number | null
  charge_amount: number | null
  allowed_amount: number | null
  paid_amount: number | null
  patient_responsibility: number | null
  deductible_amount: number | null
  copay_amount: number | null
  coinsurance_amount: number | null
  diagnosis_codes: string[] | null
  authorization_number: string | null
  claim_number: string | null
  raw_text: string
  confidence_score: number
}

export interface OCRResult {
  success: boolean
  line_items: LineItem[]
  total_items_extracted: number
  confidence_score: number
  error_message?: string
  ocr_method?: string
}

export class RobustOCRService {

  /**
   * Process a document with multiple OCR methods and image optimization
   */
  async processDocument(fileId: string, sessionId: string): Promise<OCRResult> {
    try {
      console.log(`🔍 ROBUST OCR: Starting processing for file: ${fileId}, session: ${sessionId}`)

      // Get file information
      const { data: fileData, error: fileError } = await supabaseAdmin
        .from('files')
        .select('*')
        .eq('id', fileId)
        .single()

      if (fileError || !fileData) {
        throw new Error(`File not found: ${fileId}`)
      }

      console.log(`📄 File: ${fileData.file_name} (${fileData.file_type}, ${fileData.file_size} bytes)`)

      // Download file
      const { data: fileBuffer, error: downloadError } = await supabaseAdmin.storage
        .from('uploads')
        .download(fileData.storage_path)

      if (downloadError || !fileBuffer) {
        throw new Error(`Failed to download file: ${downloadError?.message}`)
      }

      const buffer = Buffer.from(await fileBuffer.arrayBuffer())
      console.log(`⬇️ Downloaded: ${buffer.length} bytes`)

      // Optimize image for better OCR
      const optimizedBuffer = await this.optimizeImageForOCR(buffer, fileData.file_type)
      console.log(`🖼️ Optimized: ${buffer.length} → ${optimizedBuffer.length} bytes`)

      // Try multiple OCR methods in order of reliability
      const ocrMethods = [
        { name: 'Google Cloud Vision', method: () => this.processWithGoogleVision(optimizedBuffer) },
        { name: 'OpenAI Vision', method: () => this.processWithOpenAI(optimizedBuffer, fileData.file_type, fileData.file_name) },
        { name: 'Anthropic Claude', method: () => this.processWithAnthropic(optimizedBuffer, fileData.file_type, fileData.file_name) }
      ]

      let lastError = ''

      for (const { name, method } of ocrMethods) {
        try {
          console.log(`🤖 Trying ${name}...`)
          const result = await method()

          if (result.line_items.length > 0) {
            console.log(`✅ ${name} succeeded with ${result.line_items.length} line items`)

            // Store results
            await this.storeLineItems(result.line_items, fileId, sessionId, fileData.case_id)
            await this.updateFileRecord(fileId, result, name)

            return {
              success: true,
              line_items: result.line_items,
              total_items_extracted: result.line_items.length,
              confidence_score: result.line_items.reduce((sum, item) => sum + item.confidence_score, 0) / result.line_items.length,
              ocr_method: name
            }
          } else {
            console.log(`⚠️ ${name} succeeded but found no line items`)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          console.log(`❌ ${name} failed: ${errorMsg}`)
          lastError += `${name}: ${errorMsg}. `
        }
      }

      // If all methods failed or found no line items
      throw new Error(`All OCR methods failed or found no billing data. ${lastError}`)

    } catch (error) {
      console.error(`❌ ROBUST OCR failed for file ${fileId}:`, error)
      return {
        success: false,
        line_items: [],
        total_items_extracted: 0,
        confidence_score: 0,
        error_message: error instanceof Error ? error.message : 'Unknown OCR processing error'
      }
    }
  }

  /**
   * Optimize image for better OCR recognition
   */
  private async optimizeImageForOCR(buffer: Buffer, mimeType: string): Promise<Buffer> {
    try {
      console.log(`🔧 Optimizing image for OCR...`)

      let sharpImage = sharp(buffer)

      // Get image metadata
      const metadata = await sharpImage.metadata()
      console.log(`📐 Original: ${metadata.width}x${metadata.height}, ${metadata.format}`)

      // Optimize for OCR
      const optimized = await sharpImage
        // Resize if too large (max 2048px width while maintaining aspect ratio)
        .resize(2048, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        // Enhance contrast and sharpening for better text recognition
        .normalize()
        .sharpen({ sigma: 1.0, m1: 1.0, m2: 2.0 })
        // Convert to high-quality JPEG for better compatibility
        .jpeg({
          quality: 95,
          progressive: false,
          mozjpeg: true
        })
        .toBuffer()

      console.log(`✨ Optimized image: ${optimized.length} bytes`)
      return optimized

    } catch (error) {
      console.log(`⚠️ Image optimization failed, using original: ${error}`)
      return buffer
    }
  }

  /**
   * Process with Google Cloud Vision API (best for document OCR)
   */
  private async processWithGoogleVision(buffer: Buffer): Promise<{ line_items: LineItem[] }> {
    if (!googleVision) {
      throw new Error('Google Cloud Vision not configured')
    }

    console.log(`🔍 Processing with Google Cloud Vision...`)

    const [result] = await googleVision.textDetection({
      image: { content: buffer }
    })

    const detections = result.textAnnotations
    if (!detections || detections.length === 0) {
      throw new Error('No text detected by Google Vision')
    }

    const fullText = detections[0]?.description || ''
    console.log(`📝 Google Vision extracted ${fullText.length} characters`)

    // Process the extracted text to find billing line items
    const lineItems = this.extractLineItemsFromText(fullText, 'google_vision')

    return { line_items: lineItems }
  }

  /**
   * Process with OpenAI Vision
   */
  private async processWithOpenAI(buffer: Buffer, mimeType: string, filename: string): Promise<{ line_items: LineItem[] }> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured')
    }

    const base64Image = buffer.toString('base64')
    const dataUri = `data:image/jpeg;base64,${base64Image}`

    const systemPrompt = `You are a medical billing specialist that extracts billing line items from healthcare documents.

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any explanatory text, apologies, or commentary.

If the image does not contain medical billing information, return: {"line_items": []}`

    const userPrompt = `Extract all billing line items from this medical document. Return JSON with line_items array containing: cpt_code, code_description, service_date, charge_amount, units, raw_text for each item.`

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API timeout')), 18000)
    })

    const apiPromise = openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: dataUri } }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0
    })

    const response = await Promise.race([apiPromise, timeoutPromise]) as any
    const content = response.choices[0]?.message?.content

    if (!content) {
      throw new Error('No response from OpenAI Vision')
    }

    return this.parseAIResponse(content, 0.85)
  }

  /**
   * Process with Anthropic Claude Vision
   */
  private async processWithAnthropic(buffer: Buffer, mimeType: string, filename: string): Promise<{ line_items: LineItem[] }> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured')
    }

    const base64Image = buffer.toString('base64')

    const systemPrompt = `Extract billing line items from medical documents. Return ONLY valid JSON with line_items array.`
    const userPrompt = `Extract all billing line items from this medical document. Return JSON only.`

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Anthropic API timeout')), 15000)
    })

    const apiPromise = anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 4000,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Image
              }
            }
          ]
        }
      ]
    })

    const response = await Promise.race([apiPromise, timeoutPromise]) as any
    const content = response.content[0]?.text

    if (!content) {
      throw new Error('No response from Anthropic Claude')
    }

    return this.parseAIResponse(content, 0.80)
  }

  /**
   * Extract line items from plain text (for Google Vision results)
   */
  private extractLineItemsFromText(text: string, method: string): LineItem[] {
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    const lineItems: LineItem[] = []
    let lineNumber = 1

    // Look for patterns that indicate billing line items
    const billingPatterns = [
      /\b\d{5}\s+[A-Z][^$]*\$[\d,]+\.?\d*/,  // CPT code + description + amount
      /\b[0-9]{2}\/[0-9]{2}\/[0-9]{4}\s+\d{5}\s+.*\$[\d,]+\.?\d*/,  // Date + CPT + amount
      /\$[\d,]+\.?\d*\s*$/  // Lines ending with dollar amounts
    ]

    for (const line of lines) {
      const trimmed = line.trim()

      // Check if this line looks like a billing item
      const isBillingLine = billingPatterns.some(pattern => pattern.test(trimmed))

      if (isBillingLine && trimmed.length > 10) {
        // Extract CPT code (5 digits)
        const cptMatch = trimmed.match(/\b(\d{5})\b/)
        const cptCode = cptMatch ? cptMatch[1] : null

        // Extract dollar amount
        const amountMatch = trimmed.match(/\$?([\d,]+\.?\d*)/g)
        const lastAmount = amountMatch ? parseFloat(amountMatch[amountMatch.length - 1].replace(/[$,]/g, '')) : null

        // Extract date (MM/DD/YYYY format)
        const dateMatch = trimmed.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)
        const serviceDate = dateMatch ? this.convertToISODate(dateMatch[1]) : null

        if (cptCode || lastAmount) {
          lineItems.push({
            line_number: lineNumber++,
            cpt_code: cptCode,
            code_description: this.extractDescription(trimmed, cptCode),
            modifier_codes: null,
            service_date: serviceDate,
            place_of_service: null,
            provider_npi: null,
            units: 1,
            charge_amount: lastAmount,
            allowed_amount: null,
            paid_amount: null,
            patient_responsibility: null,
            deductible_amount: null,
            copay_amount: null,
            coinsurance_amount: null,
            diagnosis_codes: null,
            authorization_number: null,
            claim_number: null,
            raw_text: trimmed,
            confidence_score: method === 'google_vision' ? 0.90 : 0.75
          })
        }
      }
    }

    console.log(`📊 Extracted ${lineItems.length} line items from text analysis`)
    return lineItems
  }

  /**
   * Parse AI response JSON
   */
  private parseAIResponse(content: string, confidenceScore: number): { line_items: LineItem[] } {
    let jsonContent = content.trim()

    // Clean markdown
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/```json\s*/, '').replace(/\s*```$/, '')
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```\s*/, '').replace(/\s*```$/, '')
    }

    // Extract JSON
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonContent = jsonMatch[0]
    }

    const parsedResult = JSON.parse(jsonContent)
    const lineItems: LineItem[] = []

    if (parsedResult.line_items && Array.isArray(parsedResult.line_items)) {
      parsedResult.line_items.forEach((item: any, index: number) => {
        lineItems.push({
          line_number: item.line_number || index + 1,
          cpt_code: item.cpt_code || null,
          code_description: item.code_description || null,
          modifier_codes: item.modifier_codes || null,
          service_date: item.service_date || null,
          place_of_service: item.place_of_service || null,
          provider_npi: item.provider_npi || null,
          units: item.units || 1,
          charge_amount: item.charge_amount || null,
          allowed_amount: item.allowed_amount || null,
          paid_amount: item.paid_amount || null,
          patient_responsibility: item.patient_responsibility || null,
          deductible_amount: item.deductible_amount || null,
          copay_amount: item.copay_amount || null,
          coinsurance_amount: item.coinsurance_amount || null,
          diagnosis_codes: item.diagnosis_codes || null,
          authorization_number: item.authorization_number || null,
          claim_number: item.claim_number || null,
          raw_text: item.raw_text || '',
          confidence_score: confidenceScore
        })
      })
    }

    return { line_items: lineItems }
  }

  /**
   * Helper functions
   */
  private convertToISODate(dateStr: string): string {
    const [month, day, year] = dateStr.split('/')
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  private extractDescription(line: string, cptCode: string | null): string | null {
    if (!cptCode) return null

    const parts = line.split(cptCode)
    if (parts.length < 2) return null

    const description = parts[1].trim().split('$')[0].trim()
    return description.length > 3 ? description : null
  }

  /**
   * Store line items in database
   */
  private async storeLineItems(lineItems: LineItem[], fileId: string, sessionId: string, caseId: string): Promise<void> {
    if (lineItems.length === 0) return

    // Clear existing
    await supabaseAdmin
      .from('line_items')
      .delete()
      .eq('file_id', fileId)

    // Insert new
    const insertData = lineItems.map(item => ({
      session_id: sessionId,
      file_id: fileId,
      case_id: caseId,
      line_number: item.line_number,
      cpt_code: item.cpt_code,
      code_description: item.code_description,
      modifier_codes: item.modifier_codes,
      service_date: item.service_date,
      place_of_service: item.place_of_service,
      provider_npi: item.provider_npi,
      units: item.units,
      charge_amount: item.charge_amount,
      allowed_amount: item.allowed_amount,
      paid_amount: item.paid_amount,
      patient_responsibility: item.patient_responsibility,
      deductible_amount: item.deductible_amount,
      copay_amount: item.copay_amount,
      coinsurance_amount: item.coinsurance_amount,
      diagnosis_codes: item.diagnosis_codes,
      authorization_number: item.authorization_number,
      claim_number: item.claim_number,
      confidence_score: item.confidence_score,
      extraction_method: 'robust_ocr',
      raw_text: item.raw_text,
      is_validated: false,
      has_errors: false
    }))

    const { error } = await supabaseAdmin
      .from('line_items')
      .insert(insertData)

    if (error) {
      throw new Error(`Database insert failed: ${error.message}`)
    }

    console.log(`✅ Stored ${lineItems.length} line items`)
  }

  /**
   * Update file record with OCR results
   */
  private async updateFileRecord(fileId: string, result: any, ocrMethod: string): Promise<void> {
    await supabaseAdmin
      .from('files')
      .update({
        ocr_text: `Extracted ${result.line_items.length} billing line items using ${ocrMethod}`,
        ocr_confidence: result.line_items.length > 0 ?
          result.line_items.reduce((sum: number, item: LineItem) => sum + item.confidence_score, 0) / result.line_items.length : 0
      })
      .eq('id', fileId)
  }
}