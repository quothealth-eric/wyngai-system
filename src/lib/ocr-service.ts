import OpenAI from 'openai'
import { supabase, supabaseAdmin } from '@/lib/db'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 25000, // 25 second timeout for Vercel compatibility
  maxRetries: 1
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
}

export class OCRService {

  /**
   * Process a single document and extract billing line items
   */
  async processDocument(fileId: string, sessionId: string): Promise<OCRResult> {
    try {
      console.log(`🔍 Starting OCR processing for file: ${fileId}, session: ${sessionId}`)
      console.log(`🔑 OpenAI API key configured: ${!!process.env.OPENAI_API_KEY}`)
      console.log(`🔑 OpenAI API key length: ${process.env.OPENAI_API_KEY?.length || 0}`)
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`)

      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured')
      }

      // Get file information from database
      const { data: fileData, error: fileError } = await supabaseAdmin
        .from('files')
        .select('*')
        .eq('id', fileId)
        .single()

      if (fileError || !fileData) {
        console.error(`❌ File lookup error:`, fileError)
        throw new Error(`File not found: ${fileId} - ${fileError?.message || 'No file data'}`)
      }

      console.log(`📄 File found: ${fileData.file_name} (${fileData.file_type}, ${fileData.file_size} bytes)`)
      console.log(`📁 Storage path: ${fileData.storage_path}`)

      // Download file from storage
      const { data: fileBuffer, error: downloadError } = await supabaseAdmin.storage
        .from('uploads')
        .download(fileData.storage_path)

      if (downloadError || !fileBuffer) {
        console.error(`❌ File download error:`, downloadError)
        throw new Error(`Failed to download file: ${downloadError?.message || 'No file buffer'}`)
      }

      console.log(`⬇️ File downloaded successfully: ${fileBuffer.size} bytes`)

      // Convert to buffer for OCR processing
      const buffer = Buffer.from(await fileBuffer.arrayBuffer())
      console.log(`🔄 Buffer created: ${buffer.length} bytes`)

      // Check if image is too large and needs optimization
      const maxSize = 5 * 1024 * 1024 // 5MB limit for better processing
      if (buffer.length > maxSize) {
        console.log(`⚠️ Large file detected (${buffer.length} bytes), this may cause timeout issues`)
      }

      // Process with OpenAI Vision for billing information extraction
      console.log(`🤖 Starting OpenAI Vision processing...`)
      const lineItems = await this.extractBillingInformation(buffer, fileData.file_type, fileData.file_name)
      console.log(`📊 OpenAI Vision completed: ${lineItems.length} line items extracted`)

      // Store line items in database
      await this.storeLineItems(lineItems, fileId, sessionId, fileData.case_id)

      // Update file record with OCR completion
      await supabaseAdmin
        .from('files')
        .update({
          ocr_text: `Extracted ${lineItems.length} billing line items`,
          ocr_confidence: lineItems.length > 0 ? lineItems.reduce((sum, item) => sum + item.confidence_score, 0) / lineItems.length : 0
        })
        .eq('id', fileId)

      console.log(`✅ OCR processing completed for file ${fileId}: ${lineItems.length} line items extracted`)

      return {
        success: true,
        line_items: lineItems,
        total_items_extracted: lineItems.length,
        confidence_score: lineItems.length > 0 ? lineItems.reduce((sum, item) => sum + item.confidence_score, 0) / lineItems.length : 0
      }

    } catch (error) {
      console.error(`❌ OCR processing failed for file ${fileId}:`, error)

      // Log detailed error information
      if (error instanceof Error) {
        console.error(`❌ Error name: ${error.name}`)
        console.error(`❌ Error message: ${error.message}`)
        console.error(`❌ Error stack: ${error.stack}`)
      }

      const errorMessage = error instanceof Error ?
        `${error.name}: ${error.message}` :
        'Unknown OCR processing error'

      return {
        success: false,
        line_items: [],
        total_items_extracted: 0,
        confidence_score: 0,
        error_message: errorMessage
      }
    }
  }

  /**
   * Extract billing information using OpenAI Vision
   */
  private async extractBillingInformation(fileBuffer: Buffer, mimeType: string, filename: string): Promise<LineItem[]> {
    console.log(`🖼️ Processing image: ${filename} (${mimeType})`)
    console.log(`📏 Buffer size: ${fileBuffer.length} bytes`)

    // Optimize large images for better processing
    let processedBuffer = fileBuffer
    if (fileBuffer.length > 5 * 1024 * 1024) { // 5MB
      console.log(`📐 Large image detected, processing may be slower`)
      // For now, proceed with original buffer but log the warning
      // In production, you might want to resize the image here
    }

    const base64Image = processedBuffer.toString('base64')
    const dataUri = `data:${mimeType};base64,${base64Image}`
    console.log(`🔗 Data URI created: ${dataUri.substring(0, 100)}...`)
    console.log(`📊 Base64 size: ${base64Image.length} characters`)

    const systemPrompt = `You are a medical billing specialist tasked with extracting billing line items from healthcare documents.
Extract ONLY the information that is clearly visible in the document. Do not make assumptions or add information that is not present.
Return data in JSON format only.`

    const userPrompt = `Analyze this medical billing document and extract all billing line items.

For each line item that contains billing information, extract:
- CPT/HCPCS procedure codes
- Service descriptions
- Service dates
- Financial amounts (charges, allowed, paid, patient responsibility)
- Units/quantities
- Any modifier codes
- Diagnosis codes if visible
- Provider information (NPI if visible)

Return a JSON object with this exact structure:
{
  "line_items": [
    {
      "line_number": 1,
      "cpt_code": "99213" or null,
      "code_description": "Office visit" or null,
      "modifier_codes": ["-25"] or null,
      "service_date": "2024-01-15" or null,
      "place_of_service": "11" or null,
      "provider_npi": "1234567890" or null,
      "units": 1 or null,
      "charge_amount": 150.00 or null,
      "allowed_amount": 120.00 or null,
      "paid_amount": 96.00 or null,
      "patient_responsibility": 24.00 or null,
      "deductible_amount": 0.00 or null,
      "copay_amount": 20.00 or null,
      "coinsurance_amount": 4.00 or null,
      "diagnosis_codes": ["Z00.00"] or null,
      "authorization_number": null,
      "claim_number": null,
      "raw_text": "Exact text from document for this line"
    }
  ]
}

IMPORTANT RULES:
1. Only extract information that is clearly visible and readable
2. Use null for any field that is not present or unclear
3. Extract monetary amounts as numbers (e.g., 150.00, not "$150.00")
4. Format dates as YYYY-MM-DD
5. Include the exact raw text for each line item
6. Only include lines that contain actual billing/service information
7. Do not hallucinate or guess any information

Return only the JSON object, no additional text.`

    try {
      console.log(`🚀 Sending request to OpenAI Vision API...`)

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OpenAI API call timed out after 20 seconds')), 20000)
      })

      // Race between API call and timeout
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

      console.log(`✅ OpenAI API response received`)
      console.log(`📋 Usage: ${JSON.stringify(response.usage)}`)

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response from OpenAI Vision')
      }

      try {
        // Clean the response content to extract only JSON
        let jsonContent = content.trim()

        // Remove any markdown code blocks if present
        if (jsonContent.startsWith('```json')) {
          jsonContent = jsonContent.replace(/```json\s*/, '').replace(/\s*```$/, '')
        } else if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/```\s*/, '').replace(/\s*```$/, '')
        }

        // Try to find JSON content if there's extra text
        const jsonMatch = jsonContent.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          jsonContent = jsonMatch[0]
        }

        console.log(`🔍 Attempting to parse OCR response: ${jsonContent.substring(0, 200)}...`)

        // Parse JSON response
        const parsedResult = JSON.parse(jsonContent)

        // Validate and transform the response
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
              units: item.units || null,
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
              confidence_score: 0.85 // Base confidence for GPT-4o Vision
            })
          })
        }

        return lineItems

      } catch (parseError) {
        console.error('❌ Failed to parse OCR response:', parseError)
        console.error('❌ Raw content:', content.substring(0, 500))
        throw new Error(`Failed to parse OCR response: ${parseError instanceof Error ? parseError.message : 'Invalid JSON format'}`)
      }

    } catch (error) {
      console.error('❌ OCR extraction failed:', error)
      console.error('❌ Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      })
      throw error
    }
  }

  /**
   * Store extracted line items in database
   */
  private async storeLineItems(lineItems: LineItem[], fileId: string, sessionId: string, caseId: string): Promise<void> {
    if (lineItems.length === 0) {
      console.log(`ℹ️ No line items to store for file ${fileId}`)
      return
    }

    // Clear any existing line items for this file to ensure fresh data
    await supabaseAdmin
      .from('line_items')
      .delete()
      .eq('file_id', fileId)

    console.log(`🗑️ Cleared existing line items for file ${fileId}`)

    // Prepare data for insertion
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
      extraction_method: 'openai_vision',
      raw_text: item.raw_text,
      is_validated: false,
      has_errors: false
    }))

    // Insert line items
    const { error } = await supabaseAdmin
      .from('line_items')
      .insert(insertData)

    if (error) {
      console.error(`❌ Failed to store line items:`, error)
      console.error(`❌ Insert data sample:`, JSON.stringify(insertData[0], null, 2))
      throw new Error(`Database insert failed: ${error.message} (${error.code})`)
    }

    console.log(`✅ Stored ${lineItems.length} line items for file ${fileId}`)
  }
}