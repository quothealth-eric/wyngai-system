import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const description = formData.get('description') as string
    const threadId = formData.get('threadId') as string
    const userId = formData.get('userId') as string

    // Advanced inputs
    const specificConcerns = formData.get('specificConcerns') as string
    const priorAnalysis = formData.get('priorAnalysis') as string
    const focusAreas = formData.get('focusAreas') as string
    const comparisonNeeded = formData.get('comparisonNeeded') === 'true'

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }

    // Validate file types and sizes
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/tiff']
    const maxFileSize = 20 * 1024 * 1024 // 20MB
    const maxTotalSize = 100 * 1024 * 1024 // 100MB

    let totalSize = 0
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type}` },
          { status: 400 }
        )
      }

      if (file.size > maxFileSize) {
        return NextResponse.json(
          { error: `File too large: ${file.name}. Maximum size is 20MB.` },
          { status: 400 }
        )
      }

      totalSize += file.size
    }

    if (totalSize > maxTotalSize) {
      return NextResponse.json(
        { error: 'Total file size exceeds 100MB limit' },
        { status: 400 }
      )
    }

    // For now, redirect to the existing analyzer pipeline
    // This maintains the existing backend logic while providing the new unified interface

    // Convert files to the format expected by the existing analyzer
    const fileFormData = new FormData()

    for (let i = 0; i < files.length; i++) {
      fileFormData.append('files', files[i])
    }

    if (description) {
      fileFormData.append('description', description)
    }

    // Add advanced inputs as context
    let analysisContext = ''
    if (specificConcerns) {
      analysisContext += `Specific concerns: ${specificConcerns}\n`
    }
    if (priorAnalysis) {
      analysisContext += `Prior analysis: ${priorAnalysis}\n`
    }
    if (focusAreas) {
      const areas = JSON.parse(focusAreas)
      if (areas.length > 0) {
        analysisContext += `Focus areas: ${areas.join(', ')}\n`
      }
    }
    if (comparisonNeeded) {
      analysisContext += `Comparison analysis requested\n`
    }

    if (analysisContext) {
      fileFormData.append('context', analysisContext)
    }

    // Call the existing analyzer endpoint
    const baseUrl = request.nextUrl.origin
    const analyzerResponse = await fetch(`${baseUrl}/api/analyzer/wyng-pipeline`, {
      method: 'POST',
      body: fileFormData
    })

    if (!analyzerResponse.ok) {
      const errorText = await analyzerResponse.text()
      throw new Error(`Analyzer failed: ${errorText}`)
    }

    const result = await analyzerResponse.json()

    // Transform the response to match the new interface expectations
    const response = {
      success: true,
      threadId,
      analysis: {
        summary: result.response?.summary || 'Analysis completed successfully',
        findings: result.response?.findings || [],
        recommendations: result.response?.recommendations || [],
        errors: result.response?.errors || [],
        savings: result.response?.potential_savings || null,
        total_amount: result.response?.total_amount || null,
        files_processed: files.length,
        case_id: result.case_id
      },
      metadata: {
        processing_time: result.processing_time,
        files_analyzed: files.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type
        })),
        advanced_options_used: !!(specificConcerns || priorAnalysis || focusAreas || comparisonNeeded)
      }
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Bill analysis error:', error)

    return NextResponse.json(
      {
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Bill analysis endpoint',
    methods: ['POST'],
    accepts: ['multipart/form-data'],
    max_files: 10,
    max_file_size: '20MB',
    max_total_size: '100MB',
    supported_types: ['PDF', 'JPEG', 'PNG', 'TIFF']
  })
}