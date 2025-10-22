import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { performOCR } from '@/lib/ocr'
import { anthropic } from '@/lib/anthropic'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    console.log('📝 Starting Appeal Letter Studio...')

    const formData = await request.formData()
    const threadId = formData.get('threadId') as string
    const payer = formData.get('payer') as string
    const claimId = formData.get('claimId') as string
    const dos = formData.get('dos') as string
    const codes = formData.get('codes') as string
    const denial = formData.get('denial') as string
    const selectedRules = JSON.parse(formData.get('selectedRules') as string || '[]')
    const files = formData.getAll('files') as File[]

    if (!threadId || !payer || !denial) {
      return NextResponse.json(
        { error: 'threadId, payer, and denial reason are required' },
        { status: 400 }
      )
    }

    console.log(`📄 Processing appeal for ${payer} with ${files.length} files`)

    // Process attached files with OCR
    const extractedData = []
    for (const file of files) {
      if (file.size > 0) {
        try {
          const buffer = Buffer.from(await file.arrayBuffer())
          const ocrResult = await performOCR(buffer, file.type)

          extractedData.push({
            filename: file.name,
            text: ocrResult.text,
            confidence: ocrResult.confidence
          })

          console.log(`📝 Extracted ${ocrResult.text.length} characters from ${file.name}`)
        } catch (ocrError) {
          console.warn(`OCR failed for ${file.name}:`, ocrError)
        }
      }
    }

    // Generate appeal letter, script, and checklist
    const appealPrompt = `You are an expert medical billing advocate. Generate a professional appeal letter, phone script, and action checklist.

Appeal Information:
- Insurance Company: ${payer}
- Claim ID: ${claimId || 'Not provided'}
- Date of Service: ${dos || 'Not provided'}
- Procedure Codes: ${codes || 'Not provided'}
- Denial Reason: ${denial}
- Selected Rule Violations: ${selectedRules.join(', ') || 'None specified'}

Extracted Document Data:
${extractedData.map(doc => `From ${doc.filename}: "${doc.text.substring(0, 300)}..."`).join('\n')}

Generate this JSON response:
{
  "letter": "Professional appeal letter (180-250 words)",
  "script": "Phone script for calling insurance (110-150 words)",
  "checklist": [
    "Gather all EOBs and itemized bills",
    "Document all phone calls with reference numbers",
    "Submit appeal within required timeframe",
    "Request supervisor if first-level denial",
    "Follow up in writing within 5 business days"
  ],
  "citations": [
    {
      "authority": "Federal",
      "title": "ERISA Claims Procedure Regulations"
    },
    {
      "authority": "State DOI",
      "title": "Insurance Appeals Process"
    }
  ]
}

Letter Requirements:
- Professional tone, first person
- Reference specific claim details
- Cite the denial reason
- Request reconsideration with facts
- Include member information placeholders
- 180-250 words exactly

Script Requirements:
- Conversational but assertive
- Include key talking points
- Request specific actions
- 110-150 words exactly

Use only facts from the provided information. Do not hallucinate codes, amounts, or specific medical details not provided.`

    if (!anthropic) {
      return NextResponse.json(
        { error: 'Anthropic client not available' },
        { status: 503 }
      )
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: appealPrompt
        }
      ]
    })

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

    let appealResult
    try {
      appealResult = JSON.parse(responseText)
    } catch (parseError) {
      console.error('Failed to parse appeal response:', parseError)
      return NextResponse.json(
        { error: 'Failed to generate appeal materials' },
        { status: 500 }
      )
    }

    // Validate word counts
    const letterWords = appealResult.letter.split(/\s+/).length
    const scriptWords = appealResult.script.split(/\s+/).length

    if (letterWords < 180 || letterWords > 250) {
      console.warn(`Letter word count: ${letterWords} (should be 180-250)`)
    }

    if (scriptWords < 110 || scriptWords > 150) {
      console.warn(`Script word count: ${scriptWords} (should be 110-150)`)
    }

    console.log('✅ Appeal materials generated')

    return NextResponse.json({
      success: true,
      letter: appealResult.letter,
      script: appealResult.script,
      checklist: appealResult.checklist,
      citations: appealResult.citations,
      extractedData: extractedData.map(doc => ({
        filename: doc.filename,
        textLength: doc.text.length,
        confidence: doc.confidence
      })),
      wordCounts: {
        letter: letterWords,
        script: scriptWords
      },
      appealInfo: {
        threadId,
        payer,
        claimId,
        dos,
        codes,
        denial,
        selectedRules
      }
    })

  } catch (error) {
    console.error('❌ Appeal studio failed:', error)
    return NextResponse.json(
      {
        error: 'Appeal generation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}