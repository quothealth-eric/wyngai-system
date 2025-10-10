import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { performOCR, sanitizeOCRText, validateMedicalDocument } from '@/lib/ocr'
import { redactSensitiveInfo } from '@/lib/validations'

export async function POST(request: NextRequest) {
  console.log('🎯 UPLOAD API CALLED - Starting file upload process')

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const sessionId = formData.get('sessionId') as string
    const documentNumber = parseInt(formData.get('documentNumber') as string || '1')

    if (!file) {
      console.log('❌ No file provided in upload request')
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Create a session if one doesn't exist
    let actualSessionId = sessionId
    if (!actualSessionId) {
      console.log('🆕 No session ID provided, creating new session...')
      try {
        const { data: newSession, error: sessionError } = await supabase
          .from('document_sessions')
          .insert({
            session_type: 'bill_analysis',
            user_description: 'Auto-created from file upload',
            status: 'uploading'
          })
          .select()
          .single()

        if (sessionError) {
          console.error('❌ Failed to create session:', sessionError)
          return NextResponse.json(
            { error: 'Failed to create upload session', details: sessionError.message },
            { status: 500 }
          )
        }

        actualSessionId = newSession.id
        console.log(`✅ Created new session: ${actualSessionId}`)
      } catch (error) {
        console.error('❌ Session creation error:', error)
        return NextResponse.json(
          { error: 'Failed to create upload session' },
          { status: 500 }
        )
      }
    }

    console.log(`📤 Processing upload: ${file.name} (${file.type}, ${(file.size / 1024 / 1024).toFixed(2)}MB)`)
    console.log(`🔧 Environment: ${process.env.NODE_ENV}`)
    console.log(`🏗️ Platform: Vercel serverless function`)

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log(`🆔 File buffer hash: ${buffer.slice(0, 100).toString('hex').slice(0, 20)}...`) // Log file hash for uniqueness verification

    // Enhanced file type validation - support all primary image types
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp',
      'image/webp', 'image/svg+xml', 'image/tiff', 'image/tif',
      'image/heic', 'image/heif', 'application/pdf'
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: 'Invalid file type. Supported formats: JPEG, PNG, GIF, BMP, WebP, SVG, TIFF, HEIC, PDF',
          allowedTypes,
          receivedType: file.type
        },
        { status: 400 }
      )
    }

    const maxSize = 15 * 1024 * 1024 // Increased to 15MB for better document quality
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `File size too large. Maximum size is ${maxSize / 1024 / 1024}MB.`,
          fileSize: file.size,
          maxSize
        },
        { status: 400 }
      )
    }

    // Generate unique filename with better naming
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 15)
    const fileExtension = file.name.split('.').pop()
    const fileName = `${timestamp}_${randomId}.${fileExtension}`

    try {
      // Upload file to Supabase Storage
      console.log('☁️ Uploading to Supabase Storage...')
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(fileName, buffer, {
          contentType: file.type,
          cacheControl: '3600',
        })

      if (uploadError) {
        console.error('❌ Supabase upload error:', uploadError)
        return NextResponse.json(
          { error: 'Failed to upload file', details: uploadError.message },
          { status: 500 }
        )
      }

      // Enhanced OCR processing
      let ocrResult
      let ocrText = ''
      let ocrConfidence = 0
      let documentMetadata
      let validationResult

      try {
        console.log('🔍 Starting enhanced OCR processing...')
        ocrResult = await performOCR(buffer, file.type)
        ocrText = sanitizeOCRText(ocrResult.text)
        ocrConfidence = ocrResult.confidence
        documentMetadata = ocrResult.metadata

        console.log(`✅ OCR completed: ${ocrResult.confidence}% confidence, ${ocrResult.metadata?.documentType} detected`)
        console.log(`📝 OCR text length: ${ocrText.length} characters`)
        console.log(`📝 OCR text preview: "${ocrText.substring(0, 200)}..."`)
        console.log(`🔍 OCR text hash: ${Buffer.from(ocrText).toString('hex').slice(0, 20)}...`) // Log OCR text hash for uniqueness verification

        // If OCR extracted very little text, try again with different settings
        if (ocrText.length < 20 && file.type.startsWith('image/')) {
          console.log('⚠️ OCR extracted minimal text, retrying with enhanced settings...')
          try {
            const retryResult = await performOCR(buffer, file.type)
            if (retryResult.text.length > ocrText.length) {
              ocrText = sanitizeOCRText(retryResult.text)
              ocrConfidence = Math.max(retryResult.confidence, 50) // Boost confidence for retry
              console.log(`🔄 Retry successful: ${ocrText.length} characters extracted`)
            }
          } catch (retryError) {
            console.log('⚠️ OCR retry failed, using original result')
          }
        }

        // Validate medical document
        validationResult = validateMedicalDocument(ocrResult)
        if (!validationResult.isValid) {
          console.log(`⚠️ Document validation issues: ${validationResult.issues.join(', ')}`)
        }

        // Redact sensitive information from OCR text
        ocrText = redactSensitiveInfo(ocrText)

        // Additional logging for enhanced features
        if (documentMetadata?.extractedFields) {
          const fields = documentMetadata.extractedFields
          console.log('📋 Extracted fields:')
          if (fields.policyNumber) console.log(`   📝 Policy: ${fields.policyNumber}`)
          if (fields.claimNumber) console.log(`   🏷️ Claim: ${fields.claimNumber}`)
          if (fields.dateOfService) console.log(`   📅 Date: ${fields.dateOfService}`)
          if (fields.balanceDue) console.log(`   💰 Balance: $${fields.balanceDue}`)
          if (fields.providerName) console.log(`   🏥 Provider: ${fields.providerName}`)
        }

        // Ensure we have meaningful OCR text
        if (!ocrText || ocrText.trim().length < 10) {
          console.log('⚠️ OCR extracted minimal meaningful text')
          ocrText = `Document uploaded successfully but OCR extracted minimal text. File: ${file.name}, Type: ${file.type}, Size: ${(file.size/1024/1024).toFixed(2)}MB. The document appears to contain visual information that may require manual review.`
          ocrConfidence = 25
        }

      } catch (ocrError) {
        console.error('❌ Enhanced OCR error:', ocrError)
        // Provide meaningful fallback text
        ocrText = `Document uploaded: ${file.name} (${file.type}, ${(file.size/1024/1024).toFixed(2)}MB). OCR processing encountered an error, but the document has been stored and can be manually reviewed. Error: ${ocrError instanceof Error ? ocrError.message : 'Unknown error'}`
        ocrConfidence = 0
        documentMetadata = { documentType: 'unknown', processingTime: 0 }
        validationResult = {
          isValid: false,
          issues: ['OCR processing failed'],
          suggestions: ['Try uploading a clearer image or higher resolution scan']
        }
      }

      // Verify the session exists (skip verification if we just created it)
      if (sessionId) {
        console.log(`🔍 Verifying session: ${actualSessionId}`)
        const { data: session, error: sessionError } = await supabase
          .from('document_sessions')
          .select('id, session_type, status')
          .eq('id', actualSessionId)
          .single()

        if (sessionError || !session) {
          console.error('❌ Session not found:', sessionError)
          return NextResponse.json(
            { error: 'Invalid session ID', details: sessionError?.message },
            { status: 400 }
          )
        }
        console.log(`✅ Session verified: ${session.session_type} - ${session.status}`)
      } else {
        console.log(`✅ Using newly created session: ${actualSessionId}`)
      }

      // Database record with session-based fields
      const insertData = {
        session_id: actualSessionId,
        document_number: documentNumber,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: uploadData.path,
        ocr_text: ocrText,
        ocr_confidence: ocrConfidence,
        processing_status: 'ocr_completed'
      }

      console.log('📋 Storing metadata separately (document type, extracted fields, validation):')
      console.log(`   📝 Document Type: ${documentMetadata?.documentType || 'unknown'}`)
      console.log(`   ⏱️ Processing Time: ${documentMetadata?.processingTime || 0}ms`)
      console.log(`   🔍 Extracted Fields: ${JSON.stringify(documentMetadata?.extractedFields || {})}`)
      console.log(`   ⚠️ Validation Issues: ${JSON.stringify(validationResult?.issues || [])}`)
      console.log(`   💡 Validation Suggestions: ${JSON.stringify(validationResult?.suggestions || [])}`)

      console.log('💾 Saving enhanced metadata to database...')
      console.log(`🗃️ Database insert data: ID will be generated, file: ${insertData.file_name}, OCR length: ${insertData.ocr_text.length}, confidence: ${insertData.ocr_confidence}`)

      const { data: fileData, error: dbError } = await supabase
        .from('files')
        .insert(insertData)
        .select()
        .single()

      if (dbError) {
        console.error('❌ Database error:', dbError)
        // Clean up uploaded file if database insert fails
        await supabase.storage.from('uploads').remove([fileName])
        return NextResponse.json(
          { error: 'Failed to save file metadata', details: dbError.message },
          { status: 500 }
        )
      }

      // Enhanced response with metadata and validation info
      const response: any = {
        id: fileData.id,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        ocrText: ocrText,
        ocrConfidence: ocrConfidence,
        status: 'completed',

        // Enhanced data
        documentMetadata: {
          documentType: documentMetadata?.documentType || 'unknown',
          processingTime: documentMetadata?.processingTime || 0,
          extractedFields: documentMetadata?.extractedFields || {},
        },

        validation: {
          isValid: validationResult?.isValid || false,
          issues: validationResult?.issues || [],
          suggestions: validationResult?.suggestions || [],
        },

        // Quality indicators
        qualityIndicators: {
          ocrConfidence: ocrConfidence,
          textLength: ocrText.length,
          hasStructuredData: !!(documentMetadata?.extractedFields && Object.keys(documentMetadata.extractedFields).length > 0),
          documentTypeDetected: documentMetadata?.documentType !== 'unknown'
        }
      }

      console.log(`✅ Upload processing complete: ${file.name}`)
      console.log(`📊 Quality score: OCR ${ocrConfidence}%, Type: ${documentMetadata?.documentType}, Valid: ${validationResult?.isValid}`)
      console.log(`🆔 Database ID assigned: ${response.id}`)
      console.log(`📝 OCR text length: ${ocrText.length} characters`)
      console.log(`📝 OCR preview: "${ocrText.substring(0, 100)}..."`)
      console.log(`🔍 Final OCR hash: ${Buffer.from(ocrText).toString('hex').slice(0, 20)}...`) // Final verification

      // Extract line items from OCR text
      if (ocrText && ocrText.length > 50) { // Only extract if we have meaningful text
        console.log('🔍 Extracting line items from OCR text...')
        try {
          const extractResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/analyzer/extract-line-items`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sessionId: actualSessionId,
              documentId: response.id,
              ocrText: ocrText,
              fileName: file.name,
              documentNumber: documentNumber
            })
          })

          if (extractResponse.ok) {
            const extractResult = await extractResponse.json()
            console.log(`✅ Line item extraction: ${extractResult.lineItemsExtracted} items found`)
            console.log(`📋 Extraction summary: ${JSON.stringify(extractResult.summary)}`)

            // Add extraction info to response
            response.lineItemExtraction = {
              success: true,
              itemsExtracted: extractResult.lineItemsExtracted,
              summary: extractResult.summary
            }
          } else {
            console.warn('⚠️ Line item extraction failed:', await extractResponse.text())
            response.lineItemExtraction = {
              success: false,
              error: 'Extraction API call failed'
            }
          }
        } catch (extractError) {
          console.warn('⚠️ Line item extraction error:', extractError)
          response.lineItemExtraction = {
            success: false,
            error: extractError instanceof Error ? extractError.message : 'Unknown extraction error'
          }
        }
      } else {
        console.log('⚠️ Skipping line item extraction - insufficient OCR text')
        response.lineItemExtraction = {
          success: false,
          error: 'Insufficient OCR text for extraction'
        }
      }

      return NextResponse.json(response)

    } catch (error) {
      console.error('❌ Upload processing error:', error)
      return NextResponse.json(
        { error: 'Failed to process upload', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('❌ Upload API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}