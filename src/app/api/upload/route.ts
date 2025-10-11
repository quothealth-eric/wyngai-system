import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import * as crypto from 'crypto'
import { queueOCRJob } from '@/lib/dual-vendor-ocr'

export async function POST(request: NextRequest) {
  console.log('🎯 ROBUST UPLOAD API - Starting multi-file upload process')

  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      console.log('❌ No files provided in upload request')
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

    // Create case record
    const { error: caseError } = await supabase
      .from('cases')
      .insert({
        case_id: caseId,
        status: 'uploading'
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

      // Create artifact registry entry
      const artifactData = {
        artifact_id: artifactId,
        case_id: caseId,
        artifact_digest: artifactDigest,
        filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        pages: 1, // Will be updated after OCR
        storage_path: storagePath
      }

      const { error: artifactError } = await supabase
        .from('artifacts')
        .insert(artifactData)

      if (artifactError) {
        console.error(`❌ Artifact registry failed for ${file.name}:`, artifactError)
        // Cleanup uploaded file
        await supabase.storage.from('uploads').remove([storagePath])
        throw new Error(`Artifact registry failed: ${artifactError.message}`)
      }

      console.log(`✅ File ${index + 1} uploaded successfully: ${artifactId}`)

      // Queue OCR job
      try {
        await queueOCRJob({
          caseId,
          artifactId,
          artifactDigest,
          storagePath,
          mimeType: file.type,
          filename: file.name
        })
        console.log(`🔍 OCR job queued for ${file.name}`)
      } catch (ocrError) {
        console.error(`⚠️ OCR queue failed for ${file.name}:`, ocrError)
        // Don't fail the upload, but log the issue
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
        .update({ status: 'processing' })
        .eq('case_id', caseId)

      console.log(`🔍 OCR jobs queued for all ${files.length} files`)

      // Return comprehensive response
      const response = {
        caseId,
        artifacts,
        status: 'uploaded',
        message: `Successfully uploaded ${files.length} files. OCR processing in progress.`,
        totalFiles: files.length,
        totalSizeMB: parseFloat((totalSize / 1024 / 1024).toFixed(2))
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
        .update({ status: 'failed' })
        .eq('case_id', caseId)

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