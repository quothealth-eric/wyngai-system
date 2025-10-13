import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import * as crypto from 'crypto'

export async function POST(request: NextRequest) {
  console.log('📤 Processing case file upload')

  try {
    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    const formData = await request.formData()
    const caseId = formData.get('caseId') as string
    const files = formData.getAll('files') as File[]

    console.log(`📤 Upload request - Case ID: ${caseId}, Files: ${files.length}`)

    if (!caseId) {
      return NextResponse.json(
        { error: 'Case ID is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Verify case exists
    const { data: caseExists } = await supabaseAdmin
      .from('cases')
      .select('case_id')
      .eq('case_id', caseId)
      .single()

    if (!caseExists) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      )
    }

    // Process file uploads
    const uploadedFiles = []
    const maxFiles = 6
    const maxFileSize = 20 * 1024 * 1024 // 20MB
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/tif',
      'image/heic', 'image/heif', 'application/pdf'
    ]

    if (files.length > maxFiles) {
      return NextResponse.json(
        { error: `Too many files. Maximum ${maxFiles} files allowed.` },
        { status: 400 }
      )
    }

    for (const file of files) {
      // Validate file
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`Invalid file type: ${file.type}`)
      }

      if (file.size > maxFileSize) {
        throw new Error(`File ${file.name} is too large: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      }

      // Generate unique storage path
      const artifactId = crypto.randomUUID()
      const fileExtension = file.name.split('.').pop() || 'bin'
      const storagePath = `case/${caseId}/${artifactId}/${file.name}`

      // Convert to buffer
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('wyng_cases')
        .upload(storagePath, buffer, {
          contentType: file.type,
          cacheControl: '3600',
        })

      if (uploadError) {
        console.error(`❌ Storage upload failed for ${file.name}:`, uploadError)
        throw new Error(`Storage upload failed: ${uploadError.message}`)
      }

      // Store file metadata
      const { data: fileData, error: fileError } = await supabaseAdmin
        .from('case_files')
        .insert({
          case_id: caseId,
          filename: file.name,
          mime: file.type,
          size_bytes: file.size,
          storage_path: storagePath
        })
        .select('id')
        .single()

      if (fileError) {
        console.error(`❌ File metadata failed for ${file.name}:`, fileError)
        // Cleanup uploaded file
        await supabaseAdmin.storage.from('wyng_cases').remove([storagePath])
        throw new Error(`File metadata failed: ${fileError.message}`)
      }

      uploadedFiles.push({
        id: fileData.id,
        filename: file.name,
        size: file.size,
        type: file.type,
        storagePath
      })

      console.log(`✅ File uploaded: ${file.name} -> ${storagePath}`)
    }

    console.log(`✅ All ${files.length} files uploaded for case ${caseId}`)

    return NextResponse.json({
      caseId,
      files: uploadedFiles,
      totalFiles: files.length,
      status: 'uploaded'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })

  } catch (error) {
    console.error('❌ Case upload error:', error)
    return NextResponse.json(
      { error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown error' },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}