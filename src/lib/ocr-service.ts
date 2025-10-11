import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { supabase, supabaseAdmin } from '@/lib/db'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // 30 second timeout
  maxRetries: 0
})

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 25000, // 25 second timeout
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
}

export class OCRService {

  /**
   * Process a single document and extract billing line items
   */
  async processDocument(fileId: string, sessionId: string): Promise<OCRResult> {
    try {
      console.log(`🔍 Starting OCR processing for file: ${fileId}, session: ${sessionId}`)
      console.log(`🔑 Google Cloud Vision configured: ${!!process.env.GOOGLE_CLOUD_ACCESS_TOKEN}`)
      console.log(`🔑 OpenAI API key configured: ${!!process.env.OPENAI_API_KEY}`)
      console.log(`🔑 Anthropic API key configured: ${!!process.env.ANTHROPIC_API_KEY}`)
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`)
      console.log(`📊 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`)

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

      // Process with multi-vendor OCR (Google Cloud Vision + OpenAI + Anthropic fallback)
      console.log(`🤖 Starting multi-vendor OCR processing...`)
      console.log(`📏 File buffer size: ${buffer.length} bytes`)
      console.log(`📄 File type: ${fileData.file_type}`)
      const lineItems = await this.extractBillingInformationDualVendor(buffer, fileData.file_type, fileData.file_name)
      console.log(`📊 Multi-vendor OCR completed: ${lineItems.length} line items extracted`)

      // Store line items in database
      await this.storeLineItems(lineItems, fileId, sessionId, fileData.case_id)

      // Update file record with OCR completion
      const ocrMethod = lineItems.length > 0 && lineItems[0].confidence_score === 0.85 ? 'OpenAI Vision' :
                       lineItems.length > 0 && lineItems[0].confidence_score === 0.80 ? 'Anthropic Claude' : 'Dual-Vendor'

      await supabaseAdmin
        .from('files')
        .update({
          ocr_text: `Extracted ${lineItems.length} billing line items using ${ocrMethod}`,
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
   * Extract billing information using dual-vendor approach (OpenAI + Anthropic fallback)
   */
  private async extractBillingInformationDualVendor(fileBuffer: Buffer, mimeType: string, filename: string): Promise<LineItem[]> {
    console.log(`🎯 Attempting multi-vendor OCR for: ${filename}`)
    console.log(`📊 Available OCR services: Google Vision: ${!!(process.env.GOOGLE_CLOUD_ACCESS_TOKEN && process.env.GOOGLE_CLOUD_PROJECT_ID)}, OpenAI: ${!!process.env.OPENAI_API_KEY}, Anthropic: ${!!process.env.ANTHROPIC_API_KEY}`)

    // Try Google Cloud Vision first (if configured)
    if (process.env.GOOGLE_CLOUD_ACCESS_TOKEN && process.env.GOOGLE_CLOUD_PROJECT_ID) {
      try {
        console.log(`🌐 Trying Google Cloud Vision first...`)
        const startTime = Date.now()
        const googleResult = await this.extractBillingInformationGoogleVision(fileBuffer, mimeType, filename)
        const duration = Date.now() - startTime
        console.log(`✅ Google Cloud Vision succeeded with ${googleResult.length} line items in ${duration}ms`)
        if (googleResult.length > 0) {
          return googleResult
        } else {
          console.log(`⚠️ Google Cloud Vision returned 0 line items, trying next service...`)
        }
      } catch (googleError) {
        console.error(`❌ Google Cloud Vision failed:`, googleError)
        console.error(`❌ Google Cloud Vision error details: ${googleError instanceof Error ? googleError.message : 'Unknown error'}`)
      }
    } else {
      console.log(`⚠️ Google Cloud Vision not configured, skipping...`)
    }

    // Try OpenAI second
    try {
      console.log(`🟢 Trying OpenAI Vision...`)
      const startTime = Date.now()
      const openAIResult = await this.extractBillingInformationOpenAI(fileBuffer, mimeType, filename)
      const duration = Date.now() - startTime
      console.log(`✅ OpenAI succeeded with ${openAIResult.length} line items in ${duration}ms`)
      if (openAIResult.length > 0) {
        return openAIResult
      } else {
        console.log(`⚠️ OpenAI returned 0 line items, trying Anthropic...`)
      }
    } catch (openAIError) {
      console.error(`❌ OpenAI failed:`, openAIError)
      console.error(`❌ OpenAI error details: ${openAIError instanceof Error ? openAIError.message : 'Unknown error'}`)
    }

    // Try Anthropic as final fallback
    try {
      console.log(`🟣 Falling back to Anthropic Claude Vision...`)
      const startTime = Date.now()
      const anthropicResult = await this.extractBillingInformationAnthropic(fileBuffer, mimeType, filename)
      const duration = Date.now() - startTime
      console.log(`✅ Anthropic succeeded with ${anthropicResult.length} line items in ${duration}ms`)
      return anthropicResult
    } catch (anthropicError) {
      console.error(`❌ Anthropic also failed:`, anthropicError)
      console.error(`❌ All OCR services failed - this should not happen in production`)

      // Return empty array instead of throwing to prevent complete failure
      console.log(`🔄 Returning empty result instead of crashing the upload`)
      return []
    }
  }

  /**
   * Extract billing information using OpenAI Vision
   */
  private async extractBillingInformationOpenAI(fileBuffer: Buffer, mimeType: string, filename: string): Promise<LineItem[]> {
    console.log(`🖼️ Processing image: ${filename} (${mimeType})`)
    console.log(`📏 Buffer size: ${fileBuffer.length} bytes`)

    // Optimize large images by reducing base64 size for OpenAI API
    let processedBuffer = fileBuffer
    const maxBufferSize = 2 * 1024 * 1024 // 2MB limit for better processing

    if (fileBuffer.length > maxBufferSize) {
      console.log(`📐 Large image detected (${fileBuffer.length} bytes), this may cause API timeouts`)
      console.log(`⚠️ Consider implementing image resizing for files > 2MB`)
      // For now, we'll try with the original but this is likely causing timeouts
    }

    const base64Image = processedBuffer.toString('base64')
    const dataUri = `data:${mimeType};base64,${base64Image}`
    console.log(`🔗 Data URI created: ${dataUri.substring(0, 100)}...`)
    console.log(`📊 Base64 size: ${base64Image.length} characters`)

    // Warn about very large base64 strings
    if (base64Image.length > 2 * 1024 * 1024) {
      console.log(`⚠️ Very large base64 string (${base64Image.length} chars) - API timeout likely`)
    }

    const systemPrompt = `You are a medical billing specialist that extracts billing line items from healthcare documents.

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any explanatory text, apologies, or commentary.

If the image does not contain medical billing information, return: {"line_items": []}

Extract only clearly visible billing information. Do not make assumptions.`

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

RESPONSE FORMAT: Return ONLY valid JSON. No explanations, no apologies, no additional text.
If no billing information is found, return: {"line_items": []}
If billing information is found, use the exact JSON structure shown above.`

    try {
      console.log(`🚀 Sending request to OpenAI Vision API...`)

      // Create a timeout promise (shorter for fallback strategy)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OpenAI API call timed out after 25 seconds')), 25000)
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
   * Extract billing information using Anthropic Claude Vision
   */
  private async extractBillingInformationAnthropic(fileBuffer: Buffer, mimeType: string, filename: string): Promise<LineItem[]> {
    console.log(`🟣 Processing with Anthropic Claude Vision: ${filename} (${mimeType})`)
    console.log(`📏 Buffer size: ${fileBuffer.length} bytes`)

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured')
    }

    const base64Image = fileBuffer.toString('base64')
    console.log(`📊 Base64 size: ${base64Image.length} characters`)

    const systemPrompt = `You are a medical billing specialist that extracts billing line items from healthcare documents.

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any explanatory text, apologies, or commentary.

If the image does not contain medical billing information, return: {"line_items": []}

Extract only clearly visible billing information. Do not make assumptions.`

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

RESPONSE FORMAT: Return ONLY valid JSON. No explanations, no apologies, no additional text.
If no billing information is found, return: {"line_items": []}
If billing information is found, use the exact JSON structure shown above.`

    try {
      console.log(`🚀 Sending request to Anthropic Claude Vision API...`)

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Anthropic API call timed out after 20 seconds')), 20000)
      })

      // Race between API call and timeout
      const apiPromise = anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userPrompt
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType === 'image/jpeg' || mimeType === 'image/jpg' ? 'image/jpeg' :
                             mimeType === 'image/png' ? 'image/png' :
                             mimeType === 'image/webp' ? 'image/webp' :
                             mimeType === 'image/gif' ? 'image/gif' : 'image/jpeg', // default fallback
                  data: base64Image
                }
              }
            ]
          }
        ]
      })

      const response = await Promise.race([apiPromise, timeoutPromise]) as any

      console.log(`✅ Anthropic API response received`)
      console.log(`📋 Usage: ${JSON.stringify(response.usage)}`)

      const content = response.content[0]?.text
      if (!content) {
        throw new Error('No response from Anthropic Claude Vision')
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

        console.log(`🔍 Attempting to parse Anthropic response: ${jsonContent.substring(0, 200)}...`)

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
              confidence_score: 0.80 // Base confidence for Claude 3.5 Sonnet Vision
            })
          })
        }

        return lineItems

      } catch (parseError) {
        console.error('❌ Failed to parse Anthropic response:', parseError)
        console.error('❌ Raw content:', content.substring(0, 500))
        throw new Error(`Failed to parse Anthropic response: ${parseError instanceof Error ? parseError.message : 'Invalid JSON format'}`)
      }

    } catch (error) {
      console.error('❌ Anthropic OCR extraction failed:', error)
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
      extraction_method: item.confidence_score === 0.85 ? 'openai_vision' :
                        item.confidence_score === 0.80 ? 'anthropic_claude' : 'dual_vendor',
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

  /**
   * Extract billing information using Google Cloud Vision
   */
  private async extractBillingInformationGoogleVision(fileBuffer: Buffer, mimeType: string, filename: string): Promise<LineItem[]> {
    console.log(`🌐 Processing with Google Cloud Vision: ${filename} (${mimeType})`)

    const accessToken = process.env.GOOGLE_CLOUD_ACCESS_TOKEN
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID

    if (!accessToken || !projectId) {
      throw new Error('Google Cloud Vision credentials not configured')
    }

    const base64Image = fileBuffer.toString('base64')
    console.log(`📊 Base64 size: ${base64Image.length} characters`)

    // Call Google Cloud Vision API with quota project
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': projectId,
      },
      body: JSON.stringify({
        requests: [{
          image: {
            content: base64Image
          },
          features: [{
            type: 'TEXT_DETECTION',
            maxResults: 50
          }]
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Google Cloud Vision API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()

    if (!result.responses || !result.responses[0] || !result.responses[0].textAnnotations) {
      throw new Error('No text detected by Google Cloud Vision')
    }

    const fullText = result.responses[0].textAnnotations[0]?.description || ''
    console.log(`📝 Google Cloud Vision extracted ${fullText.length} characters`)

    // Use AI to intelligently parse the extracted text instead of basic pattern matching
    const lineItems = await this.parseGoogleVisionTextWithAI(fullText, filename)

    console.log(`🔍 Google Cloud Vision + AI processing completed: ${lineItems.length} line items found`)
    return lineItems
  }

  /**
   * Parse Google Cloud Vision extracted text using AI for intelligent line item extraction
   */
  private async parseGoogleVisionTextWithAI(text: string, filename: string): Promise<LineItem[]> {
    console.log(`🤖 Using AI to parse ${text.length} characters of text from Google Cloud Vision`)

    if (!text || text.trim().length === 0) {
      console.log(`⚠️ No text to parse from Google Cloud Vision`)
      return []
    }

    // Use OpenAI to intelligently parse the extracted text
    try {
      const systemPrompt = `You are a medical billing specialist that extracts billing line items from healthcare documents.

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any explanatory text, apologies, or commentary.

If the text does not contain medical billing information, return: {"line_items": []}

Extract only clearly visible billing information. Do not make assumptions.`

      const userPrompt = `Analyze this text extracted from a medical billing document using Google Cloud Vision OCR and extract all billing line items.

Text to analyze:
${text}

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
}`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,
        temperature: 0.1
      })

      const content = response.choices[0]?.message?.content?.trim()
      if (!content) {
        throw new Error('No response from OpenAI')
      }

      console.log(`🔍 OpenAI response: ${content.substring(0, 200)}...`)

      // Parse the JSON response
      const parsed = JSON.parse(content)
      const lineItems: LineItem[] = []

      if (parsed.line_items && Array.isArray(parsed.line_items)) {
        parsed.line_items.forEach((item: any, index: number) => {
          lineItems.push({
            line_number: item.line_number || (index + 1),
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
            confidence_score: 0.95 // High confidence for Google Vision + OpenAI combo
          })
        })
      }

      console.log(`✅ AI parsing completed: ${lineItems.length} line items extracted from Google Cloud Vision text`)
      return lineItems

    } catch (error) {
      console.error('❌ AI parsing failed:', error)
      throw new Error(`Failed to parse Google Cloud Vision text with AI: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Extract line items from Google Cloud Vision text using pattern recognition
   */
  private extractLineItemsFromGoogleVisionText(text: string): LineItem[] {
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    const lineItems: LineItem[] = []
    let lineNumber = 1

    // Enhanced patterns for medical billing
    const billingPatterns = [
      /\b\d{5}\s+[A-Z][^$]*\$[\d,]+\.?\d*/,  // CPT code + description + amount
      /\b[0-9]{2}\/[0-9]{2}\/[0-9]{4}\s+\d{5}\s+.*\$[\d,]+\.?\d*/,  // Date + CPT + amount
      /\$[\d,]+\.?\d*\s*$/,  // Lines ending with dollar amounts
      /\b\d{5}\b.*\$[\d,]+/,  // CPT codes with amounts
      /(?:CPT|HCPCS)[\s:]*\d{5}/i  // CPT/HCPCS codes
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

        // Extract description (text between CPT code and amount)
        const description = this.extractDescriptionFromText(trimmed, cptCode)

        if (cptCode || lastAmount) {
          lineItems.push({
            line_number: lineNumber++,
            cpt_code: cptCode,
            code_description: description,
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
            confidence_score: 0.92 // Higher confidence for Google Cloud Vision
          })
        }
      }
    }

    console.log(`📊 Extracted ${lineItems.length} line items from Google Cloud Vision text analysis`)
    return lineItems
  }

  /**
   * Helper function to convert MM/DD/YYYY to ISO date format
   */
  private convertToISODate(dateStr: string): string {
    const [month, day, year] = dateStr.split('/')
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  /**
   * Helper function to extract description from billing line
   */
  private extractDescriptionFromText(line: string, cptCode: string | null): string | null {
    if (!cptCode) return null

    const parts = line.split(cptCode)
    if (parts.length < 2) return null

    const description = parts[1].trim().split('$')[0].trim()
    return description.length > 3 ? description : null
  }
}