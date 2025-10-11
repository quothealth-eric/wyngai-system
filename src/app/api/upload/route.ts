import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
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
    const { error: caseError } = await supabase
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
      const { data: uploadData, error: uploadError } = await supabase.storage
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

      const { error: fileError } = await supabase
        .from('files')
        .insert(fileData)

      if (fileError) {
        console.error(`❌ File registry failed for ${file.name}:`, fileError)
        // Cleanup uploaded file
        await supabase.storage.from('uploads').remove([storagePath])
        throw new Error(`File registry failed: ${fileError.message}`)
      }

      console.log(`✅ File ${index + 1} uploaded successfully: ${artifactId}`)

      // Queue simple OCR processing for supported image files
      if (file.type.startsWith('image/')) {
        // For now, just update the file record to indicate OCR is needed
        // In production, this would trigger actual OCR processing
        await supabase
          .from('files')
          .update({
            ocr_text: 'OCR processing queued for image file',
            ocr_confidence: 0.5
          })
          .eq('id', artifactId)

        console.log(`🔍 OCR queued for image file: ${file.name}`)
      } else {
        console.log(`📄 File ${file.name} uploaded (non-image, no OCR needed)`)
      }

      return {
        artifactId,
        artifactDigest,
        filename: file.name,
        size: file.size
      }
    })

    try {
      // Execute all file uploads in parallel
      const uploadResults = await Promise.all(uploadPromises)
      artifacts.push(...uploadResults)

      console.log(`✅ All ${files.length} files uploaded successfully`)

      // Update case status to processing
      await supabase
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
        response.ocrText = files[0].type.startsWith('image/') ? 'OCR processing queued for image file' : 'Document uploaded successfully'
        response.sessionCreated = true
        response.sessionId = caseId
        response.lineItemExtraction = {
          success: false,
          itemsExtracted: 0,
          message: 'OCR processing will be implemented in a future update'
        }
      }

      console.log(`✅ Upload complete - Case ID: ${caseId}, Files: ${files.length}`)
      return NextResponse.json(response)

    } catch (uploadError) {
      console.error('❌ Upload processing error:', uploadError)

      // Cleanup any uploaded files on error
      await Promise.allSettled(artifacts.map(artifact =>
        supabase.storage.from('uploads').remove([`${caseId}/${artifact.artifactId}`])
      ))

      // Mark case as failed
      await supabase
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