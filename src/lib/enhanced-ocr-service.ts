import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/db'

// Initialize clients with improved timeouts and error handling
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 25000, // 25 second timeout
  maxRetries: 0
})

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 20000, // 20 second timeout
  maxRetries: 0
})

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

export class EnhancedOCRService {

  /**
   * Process a document with enhanced dual-vendor OCR and better error handling
   */
  async processDocument(fileId: string, sessionId: string): Promise<OCRResult> {
    try {
      console.log(`🔍 ENHANCED OCR: Starting processing for file: ${fileId}, session: ${sessionId}`)

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

      // Try enhanced dual-vendor OCR with improved prompts and error handling
      const ocrMethods = [
        { name: 'OpenAI Vision (Enhanced)', method: () => this.processWithOpenAIEnhanced(buffer, fileData.file_type, fileData.file_name) },
        { name: 'Anthropic Claude (Enhanced)', method: () => this.processWithAnthropicEnhanced(buffer, fileData.file_type, fileData.file_name) }
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
      console.error(`❌ ENHANCED OCR failed for file ${fileId}:`, error)
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
   * Enhanced OpenAI Vision processing with improved prompts
   */
  private async processWithOpenAIEnhanced(buffer: Buffer, mimeType: string, filename: string): Promise<{ line_items: LineItem[] }> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured')
    }

    const base64Image = buffer.toString('base64')
    const dataUri = `data:image/jpeg;base64,${base64Image}`

    const systemPrompt = `You are a medical billing specialist expert at extracting billing line items from healthcare documents and statements.

CRITICAL INSTRUCTIONS:
1. You MUST respond with ONLY valid JSON - no explanatory text, apologies, or commentary
2. Focus on identifying billing line items, charges, CPT codes, and service details
3. Extract ALL billing-related information you can identify
4. If no medical billing data is found, return: {"line_items": []}

JSON FORMAT REQUIRED:
{
  "line_items": [
    {
      "line_number": 1,
      "cpt_code": "99213",
      "code_description": "Office visit",
      "service_date": "2024-01-15",
      "charge_amount": 150.00,
      "units": 1,
      "raw_text": "Original text from document"
    }
  ]
}`

    const userPrompt = `Analyze this medical document and extract ALL billing line items. Look for:
- CPT codes (5-digit procedure codes)
- Service descriptions
- Charge amounts (dollar values)
- Service dates
- Units/quantities
- Any billing-related line items

Return complete JSON with all found billing line items.`

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI timeout (25s)')), 23000)
    })

    const apiPromise = openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: dataUri, detail: "high" } }
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
   * Enhanced Anthropic Claude processing with improved prompts
   */
  private async processWithAnthropicEnhanced(buffer: Buffer, mimeType: string, filename: string): Promise<{ line_items: LineItem[] }> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured')
    }

    const base64Image = buffer.toString('base64')

    const systemPrompt = `You are a medical billing expert. Extract billing line items from medical documents. Return ONLY valid JSON with a line_items array. No explanations.`

    const userPrompt = `Extract ALL billing line items from this medical document. Look for CPT codes, charges, service dates, and descriptions. Return JSON format:
{"line_items": [{"line_number": 1, "cpt_code": "12345", "code_description": "Service", "service_date": "2024-01-01", "charge_amount": 100.00, "units": 1, "raw_text": "text"}]}`

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Anthropic timeout (20s)')), 18000)
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
   * Parse AI response JSON with enhanced error handling
   */
  private parseAIResponse(content: string, confidenceScore: number): { line_items: LineItem[] } {
    let jsonContent = content.trim()

    // Clean markdown formatting
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/```json\s*/, '').replace(/\s*```$/, '')
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```\s*/, '').replace(/\s*```$/, '')
    }

    // Extract JSON object
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonContent = jsonMatch[0]
    }

    let parsedResult
    try {
      parsedResult = JSON.parse(jsonContent)
    } catch (error) {
      console.error('Failed to parse AI response as JSON:', jsonContent)
      throw new Error('Invalid JSON response from AI service')
    }

    const lineItems: LineItem[] = []

    if (parsedResult.line_items && Array.isArray(parsedResult.line_items)) {
      parsedResult.line_items.forEach((item: any, index: number) => {
        lineItems.push({
          line_number: item.line_number || index + 1,
          cpt_code: item.cpt_code || null,
          code_description: item.code_description || null,
          modifier_codes: item.modifier_codes || null,
          service_date: item.service_date ? this.normalizeDate(item.service_date) : null,
          place_of_service: item.place_of_service || null,
          provider_npi: item.provider_npi || null,
          units: item.units || 1,
          charge_amount: typeof item.charge_amount === 'number' ? item.charge_amount : null,
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

    console.log(`📊 Parsed ${lineItems.length} line items from AI response`)
    return { line_items: lineItems }
  }

  /**
   * Normalize date format to ISO
   */
  private normalizeDate(dateStr: string): string | null {
    try {
      // Handle MM/DD/YYYY format
      if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [month, day, year] = dateStr.split('/')
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }

      // Handle YYYY-MM-DD format (already ISO)
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateStr
      }

      // Try to parse other formats
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }

      return null
    } catch (error) {
      console.log(`Failed to parse date: ${dateStr}`)
      return null
    }
  }

  /**
   * Store line items in database
   */
  private async storeLineItems(lineItems: LineItem[], fileId: string, sessionId: string, caseId: string): Promise<void> {
    if (lineItems.length === 0) return

    // Clear existing line items for this file
    await supabaseAdmin
      .from('line_items')
      .delete()
      .eq('file_id', fileId)

    // Insert new line items
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
      extraction_method: 'enhanced_ocr',
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

    console.log(`✅ Stored ${lineItems.length} line items in database`)
  }

  /**
   * Update file record with OCR results
   */
  private async updateFileRecord(fileId: string, result: any, ocrMethod: string): Promise<void> {
    const avgConfidence = result.line_items.length > 0 ?
      result.line_items.reduce((sum: number, item: LineItem) => sum + item.confidence_score, 0) / result.line_items.length : 0

    await supabaseAdmin
      .from('files')
      .update({
        ocr_text: `Extracted ${result.line_items.length} billing line items using ${ocrMethod}`,
        ocr_confidence: avgConfidence
      })
      .eq('id', fileId)

    console.log(`📝 Updated file record with OCR results: ${result.line_items.length} items, ${avgConfidence.toFixed(2)} confidence`)
  }
}