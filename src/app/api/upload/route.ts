import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { RobustOCRService } from '@/lib/robust-ocr-service'
import * as crypto from 'crypto'

export async function POST(request: NextRequest) {
  console.log('🎯 ROBUST UPLOAD API - Starting multi-file upload process')

  try {
    const formData = await request.formData()

    // Handle both single file ('file') and multiple files ('files')
    let files: File[] = []
    const singleFile = formData.get('file') as File | null
    const multipleFiles = formData.getAll('files') as File[]

    if (singleFile) {
      files = [singleFile]
    } else if (multipleFiles && multipleFiles.length > 0) {
      files = multipleFiles
    }

    if (!files || files.length === 0) {
      console.log('❌ No files provided in upload request (checked both "file" and "files" fields)')
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }

    // Validate file count and total size
    const maxFiles = 10
    const maxTotalSize = 100 * 1024 * 1024 // 100MB
    const maxFileSize = 20 * 1024 * 1024 // 20MB per file

    if (files.length > maxFiles) {
      return NextResponse.json(
        { error: `Too many files. Maximum ${maxFiles} files allowed.` },
        { status: 400 }
      )
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > maxTotalSize) {
      return NextResponse.json(
        { error: `Total file size too large. Maximum ${maxTotalSize / 1024 / 1024}MB allowed.` },
        { status: 400 }
      )
    }

    console.log(`📤 Processing ${files.length} files, total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`)
    console.log(`🔧 Environment: ${process.env.NODE_ENV}`)
    console.log(`🏗️ Platform: Vercel serverless function`)

    // Generate case ID for this upload session
    const caseId = crypto.randomUUID()
    console.log(`🆔 Generated case ID: ${caseId}`)

    // Create case record using existing schema
    const { error: caseError } = await supabaseAdmin
      .from('cases')
      .insert({
        id: caseId,
        llm_response: { upload_session: true, files_count: files.length },
        status: 'active',
        session_id: caseId
      })

    if (caseError) {
      console.error('❌ Failed to create case:', caseError)
      return NextResponse.json(
        { error: 'Failed to create upload case', details: caseError.message },
        { status: 500 }
      )
    }

    // Supported file types
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/tif',
      'image/heic', 'image/heif', 'application/pdf'
    ]

    const artifacts: any[] = []
    const uploadPromises = files.map(async (file, index) => {
      console.log(`📄 Processing file ${index + 1}/${files.length}: ${file.name} (${file.type}, ${(file.size / 1024 / 1024).toFixed(2)}MB)`)

      // Validate file type
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`Invalid file type: ${file.type}. Supported: PDF, JPG, PNG, TIFF, HEIC`)
      }

      // Validate file size
      if (file.size > maxFileSize) {
        throw new Error(`File ${file.name} too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum: ${maxFileSize / 1024 / 1024}MB`)
      }

      // Convert file to buffer and generate metadata
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const artifactId = crypto.randomUUID()
      const artifactDigest = crypto.createHash('sha256').update(buffer).digest('hex')

      console.log(`🆔 File ${index + 1} - Artifact ID: ${artifactId}, Digest: ${artifactDigest.slice(0, 16)}...`)

      // Generate unique storage path
      const timestamp = Date.now()
      const fileExtension = file.name.split('.').pop()
      const storagePath = `${caseId}/${artifactId}.${fileExtension}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('uploads')
        .upload(storagePath, buffer, {
          contentType: file.type,
          cacheControl: '3600',
        })

      if (uploadError) {
        console.error(`❌ Storage upload failed for ${file.name}:`, uploadError)
        throw new Error(`Storage upload failed: ${uploadError.message}`)
      }

      // Create file record using existing schema
      const fileData = {
        id: artifactId,
        case_id: caseId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        ocr_text: '', // Placeholder until OCR is implemented
        ocr_confidence: 0.0
      }

      const { error: fileError } = await supabaseAdmin
        .from('files')
        .insert(fileData)

      if (fileError) {
        console.error(`❌ File registry failed for ${file.name}:`, fileError)
        // Cleanup uploaded file
        await supabaseAdmin.storage.from('uploads').remove([storagePath])
        throw new Error(`File registry failed: ${fileError.message}`)
      }

      console.log(`✅ File ${index + 1} uploaded successfully: ${artifactId}`)

      // Perform immediate OCR processing for supported files
      let ocrText = ''
      let ocrConfidence = 0.0
      let lineItemsCount = 0

      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        console.log(`🔍 Starting OCR processing for: ${file.name}`)

        try {
          const ocrService = new RobustOCRService()
          const ocrResult = await ocrService.processDocument(artifactId, caseId)

          if (ocrResult.success) {
            ocrText = `Extracted ${ocrResult.total_items_extracted} billing line items`
            ocrConfidence = ocrResult.confidence_score
            lineItemsCount = ocrResult.total_items_extracted
            console.log(`✅ OCR completed for ${file.name}: ${lineItemsCount} line items extracted`)
          } else {
            ocrText = `OCR failed: ${ocrResult.error_message}`
            ocrConfidence = 0.0
            console.log(`❌ OCR failed for ${file.name}: ${ocrResult.error_message}`)
          }
        } catch (ocrError) {
          console.error(`❌ OCR processing error for ${file.name}:`, ocrError)
          ocrText = `OCR error: ${ocrError instanceof Error ? ocrError.message : 'Unknown error'}`
          ocrConfidence = 0.0
        }

        // Update file record with actual OCR results
        await supabaseAdmin
          .from('files')
          .update({
            ocr_text: ocrText,
            ocr_confidence: ocrConfidence
          })
          .eq('id', artifactId)
      } else {
        ocrText = 'File type not supported for OCR'
        console.log(`📄 File ${file.name} uploaded (type not supported for OCR)`)
      }

      return {
        artifactId,
        artifactDigest,
        filename: file.name,
        size: file.size,
        ocrText,
        ocrConfidence,
        lineItemsCount
      }
    })

    try {
      // Execute all file uploads in parallel
      const uploadResults = await Promise.all(uploadPromises)
      artifacts.push(...uploadResults)

      console.log(`✅ All ${files.length} files uploaded successfully`)

      // Update case status to processing
      await supabaseAdmin
        .from('cases')
        .update({
          status: 'active',
          llm_response: { upload_session: true, files_count: files.length, upload_completed: true }
        })
        .eq('id', caseId)

      console.log(`📝 Upload completed for all ${files.length} files - OCR processing to be implemented`)

      // Return comprehensive response
      const response: any = {
        caseId,
        artifacts,
        status: 'uploaded',
        message: `Successfully uploaded ${files.length} files. Files stored and ready for processing.`,
        totalFiles: files.length,
        totalSizeMB: parseFloat((totalSize / 1024 / 1024).toFixed(2))
      }

      // For single file uploads, include legacy fields for frontend compatibility
      if (files.length === 1 && artifacts.length === 1) {
        response.id = artifacts[0].artifactId
        response.ocrText = artifacts[0].ocrText
        response.sessionCreated = true
        response.sessionId = caseId
        response.lineItemExtraction = {
          success: artifacts[0].lineItemsCount > 0,
          itemsExtracted: artifacts[0].lineItemsCount,
          message: artifacts[0].lineItemsCount > 0
            ? `Successfully extracted ${artifacts[0].lineItemsCount} billing line items`
            : 'No billing line items found in document'
        }
      }

      console.log(`✅ Upload complete - Case ID: ${caseId}, Files: ${files.length}`)
      return NextResponse.json(response)

    } catch (uploadError) {
      console.error('❌ Upload processing error:', uploadError)

      // Cleanup any uploaded files on error
      await Promise.allSettled(artifacts.map(artifact =>
        supabaseAdmin.storage.from('uploads').remove([`${caseId}/${artifact.artifactId}`])
      ))

      // Mark case as failed
      await supabaseAdmin
        .from('cases')
        .update({
          status: 'active',
          llm_response: { upload_session: true, files_count: files.length, upload_failed: true, error: uploadError instanceof Error ? uploadError.message : 'Unknown error' }
        })
        .eq('id', caseId)

      return NextResponse.json(
        { error: 'Failed to process uploads', details: uploadError instanceof Error ? uploadError.message : 'Unknown error' },
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