import { ImageAnnotatorClient } from '@google-cloud/vision'
import { supabaseAdmin } from '@/lib/db'

// CLEAN OCR SERVICE - GOOGLE CLOUD VISION ONLY
// Completely rebuilt to remove all OpenAI/Anthropic references

let visionClient: ImageAnnotatorClient | null = null

// Initialize Google Cloud Vision client with proper credentials handling
const initializeVisionClient = () => {
  if (!visionClient && process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_CLOUD_PROJECT_ID) {
    try {
      const fs = require('fs')
      const path = require('path')

      // Handle both absolute and relative paths
      let credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
      if (!path.isAbsolute(credentialsPath)) {
        credentialsPath = path.join(process.cwd(), credentialsPath)
      }

      console.log(`🔑 Loading Google Cloud credentials from: ${credentialsPath}`)

      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))

      visionClient = new ImageAnnotatorClient({
        credentials,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      })

      console.log(`✅ Google Cloud Vision client initialized for project: ${process.env.GOOGLE_CLOUD_PROJECT_ID}`)
      console.log(`📧 Using service account: ${credentials.client_email}`)
    } catch (error) {
      console.error(`❌ Failed to initialize Google Cloud Vision client:`, error)
      console.error(`❌ Credentials path: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`)
      console.error(`❌ Project ID: ${process.env.GOOGLE_CLOUD_PROJECT_ID}`)
    }
  }
  return visionClient
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
}

export class OCRService {

  /**
   * Process a single document and extract billing line items
   */
  async processDocument(fileId: string, sessionId: string): Promise<OCRResult> {
    try {
      console.log(`🔍 Starting OCR processing for file: ${fileId}, session: ${sessionId}`)
      console.log(`🔑 Google Cloud Vision configured: ${!!(process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_CLOUD_PROJECT_ID)}`)

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

      // Process with Google Cloud Vision only
      console.log(`🤖 Starting Google Cloud Vision processing...`)
      const lineItems = await this.extractTextWithGoogleVision(buffer, fileData.file_type, fileData.file_name)
      console.log(`📊 Google Cloud Vision completed: ${lineItems.length} line items extracted`)

      // Store line items in database
      if (lineItems.length > 0) {
        await this.storeLineItems(lineItems, fileId, sessionId, fileData.case_id)
      }

      // Update file record with OCR completion
      await supabaseAdmin
        .from('files')
        .update({
          ocr_text: lineItems.map(item => item.raw_text).join('\n'),
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
   * Extract text using Google Cloud Vision only
   */
  private async extractTextWithGoogleVision(fileBuffer: Buffer, mimeType: string, filename: string): Promise<LineItem[]> {
    console.log(`🌐 Processing with Google Cloud Vision: ${filename} (${mimeType})`)
    console.log(`📏 Buffer size: ${fileBuffer.length} bytes`)

    try {
      // Initialize the Google Cloud Vision client
      const client = initializeVisionClient()
      if (!client) {
        throw new Error('Google Cloud Vision client not initialized')
      }

      // Use the Google Cloud Vision client library
      const [result] = await client.textDetection({
        image: {
          content: fileBuffer
        }
      })

      const detections = result.textAnnotations
      if (!detections || detections.length === 0) {
        console.log(`⚠️ No text detected by Google Cloud Vision`)
        return []
      }

      // Get the full text from the first annotation (contains all detected text)
      const fullText = detections[0]?.description || ''
      console.log(`📝 Google Cloud Vision extracted ${fullText.length} characters`)

      if (fullText.length === 0) {
        console.log(`⚠️ Empty text detected by Google Cloud Vision`)
        return []
      }

      // Create simple line items from the raw text
      const lineItems = this.createSimpleLineItemsFromText(fullText, filename)

      console.log(`🔍 Google Cloud Vision processing completed: ${lineItems.length} line items found`)
      return lineItems

    } catch (error) {
      console.error(`❌ Google Cloud Vision API error:`, error)

      if (error instanceof Error) {
        console.error(`❌ Error details: ${error.name} - ${error.message}`)
        if (error.stack) {
          console.error(`❌ Stack trace: ${error.stack}`)
        }
      }

      throw new Error(`Google Cloud Vision failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create simple line items from extracted text (no AI parsing for debugging)
   */
  private createSimpleLineItemsFromText(text: string, filename: string): LineItem[] {
    console.log(`📝 Creating simple line items from ${text.length} characters of text`)

    if (!text || text.trim().length === 0) {
      console.log(`⚠️ No text to process`)
      return []
    }

    // Split text into lines and create simple line items
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    const lineItems: LineItem[] = []

    lines.forEach((line, index) => {
      if (line.trim().length > 3) { // Skip very short lines
        lineItems.push({
          line_number: index + 1,
          cpt_code: null, // We'll extract this later when we add AI back
          code_description: null,
          modifier_codes: null,
          service_date: null,
          place_of_service: null,
          provider_npi: null,
          units: 1,
          charge_amount: null,
          allowed_amount: null,
          paid_amount: null,
          patient_responsibility: null,
          deductible_amount: null,
          copay_amount: null,
          coinsurance_amount: null,
          diagnosis_codes: null,
          authorization_number: null,
          claim_number: null,
          raw_text: line.trim(),
          confidence_score: 0.90 // Base confidence for Google Cloud Vision
        })
      }
    })

    console.log(`✅ Created ${lineItems.length} simple line items from text`)
    return lineItems
  }

  /**
   * Store extracted line items in database
   */
  private async storeLineItems(lineItems: LineItem[], fileId: string, sessionId: string, caseId: string): Promise<void> {
    console.log(`💾 Attempting to store ${lineItems.length} line items for file ${fileId}`)

    if (lineItems.length === 0) {
      console.log(`ℹ️ No line items to store for file ${fileId}`)
      return
    }

    try {
      // Clear any existing line items for this file to ensure fresh data
      const { error: deleteError } = await supabaseAdmin
        .from('line_items')
        .delete()
        .eq('file_id', fileId)

      if (deleteError) {
        console.error(`⚠️ Warning: Failed to clear existing line items:`, deleteError)
      } else {
        console.log(`🗑️ Cleared existing line items for file ${fileId}`)
      }

      // Prepare data for insertion
      const insertData = lineItems.map((item, index) => ({
        session_id: sessionId,
        file_id: fileId,
        case_id: caseId,
        line_number: item.line_number || (index + 1),
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
        extraction_method: 'google_vision_only',
        raw_text: item.raw_text || '',
        is_validated: false,
        has_errors: false,
        source_document_page: 1,
        extraction_confidence_details: {
          overall_confidence: item.confidence_score,
          extraction_timestamp: new Date().toISOString()
        },
        ai_processing_metadata: {
          model_used: 'google_cloud_vision',
          processing_version: '2.0.0'
        }
      }))

      // Insert line items
      const { error: insertError } = await supabaseAdmin
        .from('line_items')
        .insert(insertData)

      if (insertError) {
        console.error(`❌ Failed to insert line items:`, insertError)
        throw new Error(`Database insert failed: ${insertError.message}`)
      }

      console.log(`✅ Successfully stored ${lineItems.length} line items for file ${fileId}`)

    } catch (error) {
      console.error(`❌ Critical error storing line items for file ${fileId}:`, error)
      throw error
    }
  }
}