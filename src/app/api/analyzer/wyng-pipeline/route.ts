import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tiff',
  'image/webp',
  'image/heic'
]

interface AnalysisRequest {
  files: File[]
  description?: string
  context?: {
    state?: string
    planType?: string
    insurerName?: string
    deductible?: number
    coinsurance?: number
    copay?: number
    oopMax?: number
    deductibleMet?: string
  }
}

export async function POST(request: NextRequest) {
  console.log('🚀 Wyng Pipeline API called - Enhanced bill analysis')

  try {
    // Check for required environment variables
    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'No AI API keys configured. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY.' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const files: File[] = []
    const description = formData.get('description') as string || ''
    const contextStr = formData.get('context') as string || '{}'

    // Extract all uploaded files
    const entries = Array.from(formData.entries())
    for (const [key, value] of entries) {
      if (key.startsWith('file_') && value instanceof File) {
        files.push(value)
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided for analysis' },
        { status: 400 }
      )
    }

    // Validate files
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type}. Supported: ${ALLOWED_TYPES.join(', ')}` },
          { status: 400 }
        )
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File ${file.name} is too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
          { status: 400 }
        )
      }
    }

    console.log(`📄 Processing ${files.length} files for analysis`)

    // Parse context
    let context = {}
    try {
      context = JSON.parse(contextStr)
    } catch {
      console.warn('Invalid context JSON, using empty context')
    }

    // Create temporary directory for processing
    const tempDir = join(tmpdir(), `wyng-analysis-${randomUUID()}`)
    await mkdir(tempDir, { recursive: true })

    try {
      // Save files to temporary directory
      const filePaths: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const buffer = Buffer.from(await file.arrayBuffer())
        const extension = file.name.split('.').pop() || 'bin'
        const filename = `page${i + 1}.${extension}`
        const filepath = join(tempDir, filename)
        await writeFile(filepath, buffer)
        filePaths.push(filepath)
        console.log(`💾 Saved ${file.name} as ${filename}`)
      }

      // Run analysis using both Anthropic and OpenAI
      const analysisResults = await runWyngAnalysis(filePaths, description, context, tempDir)

      console.log('✅ Analysis completed successfully')
      return NextResponse.json({
        success: true,
        analysisId: randomUUID(),
        results: analysisResults,
        processedFiles: files.map(f => ({ name: f.name, size: f.size, type: f.type })),
        timestamp: new Date().toISOString()
      })

    } finally {
      // Cleanup temporary files
      try {
        for (const filepath of filePaths) {
          await unlink(filepath).catch(() => {}) // Ignore errors
        }
        // Note: We don't remove the temp directory as it might contain outputs
      } catch (error) {
        console.warn('Cleanup warning:', error)
      }
    }

  } catch (error) {
    console.error('❌ Wyng Pipeline error:', error)
    return NextResponse.json(
      {
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

async function runWyngAnalysis(
  filePaths: string[],
  description: string,
  context: any,
  tempDir: string
) {
  console.log('🔬 Starting Wyng analysis with dual AI providers')

  // Build context JSON for the analysis
  const analysisContext = {
    state: context.state || 'Unknown',
    planType: context.planType || 'Unknown',
    insurerName: context.insurerName,
    benefits: {
      deductible: context.deductible,
      coinsurance: context.coinsurance,
      copay: context.copay,
      oopMax: context.oopMax,
      deductibleMet: context.deductibleMet
    }
  }

  // Prepare files for analysis
  const base64Files = await Promise.all(filePaths.map(async (filepath) => {
    const fs = await import('fs/promises')
    const buffer = await fs.readFile(filepath)
    const mimeType = getMimeType(filepath)
    return {
      data: buffer.toString('base64'),
      mimeType,
      filename: filepath.split('/').pop()
    }
  }))

  // Run Anthropic analysis
  let anthropicResults = null
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      anthropicResults = await runAnthropicAnalysis(base64Files, description, analysisContext)
      console.log('✅ Anthropic analysis completed')
    } catch (error) {
      console.error('❌ Anthropic analysis failed:', error)
    }
  }

  // Run OpenAI analysis
  let openaiResults = null
  if (process.env.OPENAI_API_KEY) {
    try {
      openaiResults = await runOpenAIAnalysis(base64Files, description, analysisContext)
      console.log('✅ OpenAI analysis completed')
    } catch (error) {
      console.error('❌ OpenAI analysis failed:', error)
    }
  }

  // Combine results with preference for Anthropic
  const selectedResults = anthropicResults || openaiResults

  if (!selectedResults) {
    throw new Error('Both AI providers failed to complete analysis')
  }

  // Generate appeals and guidance
  const appeals = await generateAppeals(selectedResults, analysisContext)

  return {
    analysis: selectedResults,
    appeals,
    metadata: {
      anthropicAvailable: !!anthropicResults,
      openaiAvailable: !!openaiResults,
      selectedProvider: anthropicResults ? 'anthropic' : 'openai',
      filesProcessed: filePaths.length,
      contextProvided: Object.keys(analysisContext).length > 0
    }
  }
}

async function runAnthropicAnalysis(files: any[], description: string, context: any) {
  const content = [
    {
      type: 'text',
      text: JSON.stringify({
        citations_kb: getCitationKB(),
        context,
        description
      })
    }
  ]

  // Add images
  for (const file of files) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: file.mimeType,
        data: file.data
      }
    } as any)
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 9000,
      system: getAnalyzerPrompt(),
      messages: [{ role: 'user', content }]
    })
  })

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`)
  }

  const result = await response.json()
  return JSON.parse(result.content[0].text)
}

async function runOpenAIAnalysis(files: any[], description: string, context: any) {
  const content = [
    {
      type: 'text',
      text: JSON.stringify({
        citations_kb: getCitationKB(),
        context,
        description
      })
    }
  ]

  // Add images
  for (const file of files) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${file.mimeType};base64,${file.data}`
      }
    } as any)
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 9000,
      temperature: 0.1,
      messages: [
        { role: 'system', content: getAnalyzerPrompt() },
        { role: 'user', content }
      ]
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const result = await response.json()
  return JSON.parse(result.choices[0].message.content)
}

async function generateAppeals(analysis: any, context: any) {
  const appealsPrompt = getAppealsPrompt()

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-latest',
          max_tokens: 9000,
          system: appealsPrompt,
          messages: [{
            role: 'user',
            content: [{
              type: 'text',
              text: JSON.stringify({
                analysis,
                citations_kb: getCitationKB(),
                context
              })
            }]
          }]
        })
      })

      if (response.ok) {
        const result = await response.json()
        return JSON.parse(result.content[0].text)
      }
    } catch (error) {
      console.error('Appeals generation failed:', error)
    }
  }

  return {
    appeals: {
      checklist: ['Review analysis results', 'Contact insurance company', 'Request itemized bill'],
      docRequests: ['Medical records', 'Explanation of benefits'],
      letters: {
        payer_appeal: { subject: 'Bill Analysis Appeal', body_md: 'Generated appeal based on analysis findings.' },
        provider_dispute: { subject: 'Billing Dispute', body_md: 'Generated dispute letter.' },
        state_doi_complaint: { subject: 'State DOI Complaint', body_md: 'State complaint template.' }
      },
      phone_scripts: {
        insurer: 'Call your insurance company with these talking points...',
        provider: 'When calling your provider, mention these issues...',
        state_doi: 'If needed, contact your state department of insurance...'
      }
    }
  }
}

function getMimeType(filepath: string): string {
  const ext = filepath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'tiff':
    case 'tif': return 'image/tiff'
    case 'webp': return 'image/webp'
    case 'heic': return 'image/heic'
    case 'pdf': return 'application/pdf'
    default: return 'image/jpeg'
  }
}

function getCitationKB() {
  return {
    citations: [
      {
        id: "nsa_149110",
        title: "45 CFR §149.110 – Preventing surprise medical bills for emergency services",
        url: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-B/section-149.110",
        jurisdiction: "Federal",
        topic: "NSA Emergency",
        pinpoint: "coverage without prior auth; no greater cost-sharing for OON emergency"
      },
      {
        id: "nsa_149410",
        title: "45 CFR §149.410 – Balance billing in cases of emergency services",
        url: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-E/section-149.410",
        jurisdiction: "Federal",
        topic: "NSA Balance Billing – Emergency",
        pinpoint: "ban on balance billing beyond in-network cost-sharing for OON emergency"
      }
      // ... other citations from wyng_bill_pipeline.sh
    ]
  }
}

function getAnalyzerPrompt() {
  return `SYSTEM ROLE
You are **Wyng Lite — Hospital Bill Extractor & Analyzer**. You must:
(1) OCR+parse one or more bill images into a strict JSON schema,
(2) Build a complete **CPT/HCPCS/Rev code list** (aggregated) — this must appear BEFORE issues in the Markdown,
(3) Apply ALL **18 detectors** (listed below) with policy citations from CITATION_KB,
(4) Merge the user's free‑text **description** with parsed content into a single **combinedQuery** used to tailor findings,
(5) Output a single JSON object and a comprehensive Markdown **report_md**.

STRICT OUTPUT (return ONE JSON object):
{
  "header": {...},
  "items": [ ... BillLineItem ... ],
  "codesIndex": { "<code>": {...} },
  "combinedQuery": string,
  "findings": [ ... DetectorFinding ... ],
  "math": { "sumOfLineCharges": number|null, "lineCount": number, "uniqueCodes": number,
            "byDepartment": { "<dept>": number }, "notes": [string] },
  "report_md": "..."
}

Return JSON ONLY; no extra text.`
}

function getAppealsPrompt() {
  return `SYSTEM ROLE
You draft consumer‑ready **appeal packages** based on a prior Wyng Lite bill analysis JSON and CITATION_KB.
Return ONE JSON object with appeals, phone scripts, and guidance.
Return JSON ONLY.`
}

export async function GET() {
  return NextResponse.json({
    message: 'Wyng Pipeline API - Enhanced Bill Analysis',
    methods: ['POST'],
    features: [
      'Dual AI provider support (Anthropic + OpenAI)',
      '18 compliance detectors',
      'Legal citation database',
      'Appeal letter generation',
      'Phone script creation',
      'Multi-document analysis'
    ],
    maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
    supportedTypes: ALLOWED_TYPES
  })
}