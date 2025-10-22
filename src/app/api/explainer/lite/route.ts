import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { performOCR } from '@/lib/ocr'
import { anthropic } from '@/lib/anthropic'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Starting Explainer Lite...')

    const formData = await request.formData()
    const threadId = formData.get('threadId') as string
    const mode = formData.get('mode') as string
    const text = formData.get('text') as string
    const file = formData.get('file') as File

    if (!threadId || !mode) {
      return NextResponse.json(
        { error: 'threadId and mode are required' },
        { status: 400 }
      )
    }

    if (!['text', 'image', 'pdf'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be text, image, or pdf' },
        { status: 400 }
      )
    }

    let extractedText = ''
    let storagePath: string | null = null

    // Handle different input modes
    if (mode === 'text') {
      if (!text) {
        return NextResponse.json(
          { error: 'text is required for text mode' },
          { status: 400 }
        )
      }
      extractedText = text
    } else {
      if (!file) {
        return NextResponse.json(
          { error: 'file is required for image/pdf mode' },
          { status: 400 }
        )
      }

      // Validate file type
      const allowedTypes = mode === 'image'
        ? ['image/jpeg', 'image/png', 'image/jpg']
        : ['application/pdf']

      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: `Invalid file type for ${mode} mode` },
          { status: 400 }
        )
      }

      // Store file temporarily
      const buffer = Buffer.from(await file.arrayBuffer())
      const fileName = `explainer-lite/${threadId}/${Date.now()}-${file.name}`

      const { data: storageData, error: storageError } = await supabaseAdmin.storage
        .from('wyng_cases')
        .upload(fileName, buffer, {
          contentType: file.type,
          upsert: false
        })

      if (storageError) {
        console.error('Storage error:', storageError)
        return NextResponse.json(
          { error: 'Failed to store file' },
          { status: 500 }
        )
      }

      storagePath = storageData.path

      // Perform OCR (OpenAI-first, then GCV, then Tesseract)
      try {
        console.log('🔍 Extracting text with OCR...')
        const ocrResult = await performOCR(buffer, file.type)
        extractedText = ocrResult.text

        if (!extractedText.trim()) {
          throw new Error('No text extracted from file')
        }

        console.log(`📝 Extracted ${extractedText.length} characters`)
      } catch (ocrError) {
        console.error('OCR failed:', ocrError)
        return NextResponse.json(
          { error: 'Failed to extract text from file' },
          { status: 500 }
        )
      }
    }

    // Generate 3-bullet explanation using LLM
    console.log('🤖 Generating explanation...')

    const prompt = `You are an expert medical billing assistant. Analyze this medical billing text and provide exactly 3 bullets explaining it in plain English.

Text to analyze: "${extractedText}"

Respond with exactly this JSON format:
{
  "bullets": [
    {
      "title": "What this means",
      "text": "Plain English explanation of what this code/line/charge represents"
    },
    {
      "title": "Common issues",
      "text": "Common billing mistakes or red flags to watch for with this type of charge"
    },
    {
      "title": "Your next step",
      "text": "Specific action you should take (e.g., request itemized bill, call insurance, etc.)"
    }
  ],
  "citations": [
    {
      "authority": "CMS",
      "title": "Medicare Claims Processing Manual"
    },
    {
      "authority": "Federal",
      "title": "No Surprises Act"
    }
  ],
  "link": {
    "text": "Learn more about billing codes",
    "url": "https://www.cms.gov/medicare/coding"
  }
}

Rules:
- Each bullet text must be 40-80 words
- Focus on the most important codes, amounts, or descriptions in the input
- Do not hallucinate specific codes or amounts not in the input
- For common issues, reference our 18-rule analyzer categories at a high level
- Citations should be real authorities (CMS, Federal, State DOI)
- Keep it actionable and helpful`

    if (!anthropic) {
      return NextResponse.json(
        { error: 'Anthropic client not available' },
        { status: 503 }
      )
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

    let bullets, citations, link
    try {
      const parsed = JSON.parse(responseText)
      bullets = parsed.bullets
      citations = parsed.citations
      link = parsed.link
    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError)
      return NextResponse.json(
        { error: 'Failed to generate explanation' },
        { status: 500 }
      )
    }

    // Store in database
    const { data: explainerData, error: dbError } = await supabaseAdmin
      .from('explainer_lite')
      .insert({
        thread_id: threadId,
        input_mode: mode,
        raw_input: mode === 'text' ? text : null,
        storage_path: storagePath,
        bullets: { bullets, citations, link }
      })
      .select('id')
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to save explanation' },
        { status: 500 }
      )
    }

    console.log('✅ Explainer Lite completed')

    return NextResponse.json({
      success: true,
      id: explainerData.id,
      bullets,
      citations,
      link,
      mode,
      threadId
    })

  } catch (error) {
    console.error('❌ Explainer Lite failed:', error)
    return NextResponse.json(
      {
        error: 'Explainer failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}