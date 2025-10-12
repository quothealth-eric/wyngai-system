import { ImageAnnotatorClient } from '@google-cloud/vision'
import { supabaseAdmin } from '@/lib/db'

// Simple Google Cloud Vision OCR Service
// This removes all OpenAI dependencies and focuses only on Google Cloud Vision

let visionClient: ImageAnnotatorClient | null = null

// Initialize Google Cloud Vision client
const initializeVisionClient = () => {
  if (!visionClient && process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_CLOUD_PROJECT_ID) {
    try {
      const fs = require('fs')
      const path = require('path')

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
      return visionClient
    } catch (error) {
      console.error(`❌ Failed to initialize Google Cloud Vision client:`, error)
      return null
    }
  }
  return visionClient
}

export interface SimpleLineItem {
  line_number: number
  raw_text: string
  confidence_score: number
  extracted_at: string
}

export interface SimpleOCRResult {
  success: boolean
  full_text: string
  line_items: SimpleLineItem[]
  total_characters: number
  confidence_score: number
  error_message?: string
}

export class SimpleGoogleVisionOCR {

  /**
   * Process a single document and extract text using Google Cloud Vision only
   */
  async processDocument(fileId: string, sessionId: string): Promise<SimpleOCRResult> {
    try {
      console.log(`🔍 SIMPLE OCR - Starting processing for file: ${fileId}`)
      console.log(`🔑 Google Cloud Vision configured: ${!!(process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_CLOUD_PROJECT_ID)}`)

      // Get file information from database
      const { data: fileData, error: fileError } = await supabaseAdmin
        .from('files')
        .select('*')
        .eq('id', fileId)
        .single()

      if (fileError || !fileData) {
        console.error(`❌ File lookup error:`, fileError)
        throw new Error(`File not found: ${fileId}`)
      }

      console.log(`📄 File found: ${fileData.file_name} (${fileData.file_type}, ${fileData.file_size} bytes)`)

      // Download file from storage
      const { data: fileBuffer, error: downloadError } = await supabaseAdmin.storage
        .from('uploads')
        .download(fileData.storage_path)

      if (downloadError || !fileBuffer) {
        console.error(`❌ File download error:`, downloadError)
        throw new Error(`Failed to download file: ${downloadError?.message}`)
      }

      console.log(`⬇️ File downloaded successfully: ${fileBuffer.size} bytes`)

      // Convert to buffer for OCR processing
      const buffer = Buffer.from(await fileBuffer.arrayBuffer())
      console.log(`🔄 Buffer created: ${buffer.length} bytes`)

      // Process with Google Cloud Vision only
      const result = await this.extractTextWithGoogleVision(buffer, fileData.file_type, fileData.file_name)

      // Update file record with OCR results
      await supabaseAdmin
        .from('files')
        .update({
          ocr_text: result.full_text,
          ocr_confidence: result.confidence_score
        })
        .eq('id', fileId)

      console.log(`✅ SIMPLE OCR processing completed for file ${fileId}`)
      return result

    } catch (error) {
      console.error(`❌ SIMPLE OCR processing failed for file ${fileId}:`, error)

      const errorMessage = error instanceof Error ? error.message : 'Unknown OCR processing error'

      return {
        success: false,
        full_text: '',
        line_items: [],
        total_characters: 0,
        confidence_score: 0,
        error_message: errorMessage
      }
    }
  }

  /**
   * Extract text using Google Cloud Vision only
   */
  private async extractTextWithGoogleVision(fileBuffer: Buffer, mimeType: string, filename: string): Promise<SimpleOCRResult> {
    console.log(`🌐 Processing with Google Cloud Vision: ${filename} (${mimeType})`)
    console.log(`📏 Buffer size: ${fileBuffer.length} bytes`)

    try {
      // Initialize the Google Cloud Vision client
      const client = initializeVisionClient()
      if (!client) {
        throw new Error('Google Cloud Vision client not initialized')
      }

      console.log(`🚀 Calling Google Cloud Vision API...`)

      // Use the Google Cloud Vision client library
      const [result] = await client.textDetection({
        image: {
          content: fileBuffer
        }
      })

      const detections = result.textAnnotations
      if (!detections || detections.length === 0) {
        console.log(`⚠️ No text detected by Google Cloud Vision`)
        return {
          success: true,
          full_text: '',
          line_items: [],
          total_characters: 0,
          confidence_score: 0
        }
      }

      // Get the full text from the first annotation (contains all detected text)
      const fullText = detections[0]?.description || ''
      console.log(`📝 Google Cloud Vision extracted ${fullText.length} characters`)

      if (fullText.length === 0) {
        console.log(`⚠️ Empty text detected by Google Cloud Vision`)
        return {
          success: true,
          full_text: '',
          line_items: [],
          total_characters: 0,
          confidence_score: 0
        }
      }

      // Split text into lines for simple line items
      const lines = fullText.split('\n').filter(line => line.trim().length > 0)
      const lineItems: SimpleLineItem[] = lines.map((line, index) => ({
        line_number: index + 1,
        raw_text: line.trim(),
        confidence_score: 0.90, // Base confidence for Google Cloud Vision
        extracted_at: new Date().toISOString()
      }))

      console.log(`🔍 Google Cloud Vision processing completed: ${lineItems.length} lines extracted`)

      return {
        success: true,
        full_text: fullText,
        line_items: lineItems,
        total_characters: fullText.length,
        confidence_score: 0.90
      }

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
}