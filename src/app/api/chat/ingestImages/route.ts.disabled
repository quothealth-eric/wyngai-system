import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { ImageProcessor, ProcessedImage } from '@/lib/image-processor'
import { CaseFusion, ChatCaseInput } from '@/lib/case-fusion'
import { IntentClassifier } from '@/lib/intent-classifier'
import { RulesEngine } from '@/lib/rules-engine'
import { AnswerPackGenerator, ChatAnswer } from '@/lib/answer-pack-generator'
import { redactSensitiveInfo } from '@/lib/validations'

interface IngestImagesRequest {
  files: File[]
  narrative: string
  benefits?: {
    planType?: "HMO" | "PPO" | "EPO" | "HDHP" | "Other"
    network?: "IN" | "OUT" | "Unknown"
    deductible?: {
      individual?: number
      family?: number
      met?: number
    }
    coinsurance?: number
    copays?: { [svc: string]: number }
    oopMax?: {
      individual?: number
      family?: number
      met?: number
    }
    secondaryCoverage?: boolean
    priorAuthRequired?: boolean
    referralRequired?: boolean
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Enhanced chat ingest images API called')

    const formData = await request.formData()
    const narrative = formData.get('narrative') as string
    const benefitsJson = formData.get('benefits') as string
    const files: File[] = []

    for (const entry of Array.from(formData.entries())) {
      const [key, value] = entry
      if (key.startsWith('file_') && value instanceof File) {
        files.push(value)
      }
    }

    console.log(`📄 Processing ${files.length} files with narrative: "${narrative?.substring(0, 100)}..."`)

    let benefits
    if (benefitsJson) {
      try {
        benefits = JSON.parse(benefitsJson)
      } catch (e) {
        console.warn('⚠️ Failed to parse benefits JSON:', e)
      }
    }

    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/webp', 'image/tiff', 'application/pdf']

    for (const file of files) {
      if (!supportedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type}. Supported: JPG, JPEG, PNG, HEIC, WEBP, TIFF, PDF` },
          { status: 400 }
        )
      }

      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: `File ${file.name} is too large. Maximum size: 10MB` },
          { status: 400 }
        )
      }
    }

    if (!narrative || narrative.trim().length === 0) {
      return NextResponse.json(
        { error: 'Narrative is required' },
        { status: 400 }
      )
    }

    const processedImages: ProcessedImage[] = []

    for (const file of files) {
      try {
        console.log(`🔍 Processing image: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)`)

        const processedImage = await ImageProcessor.processImage(file)
        processedImages.push(processedImage)

        console.log(`✅ Image processed: ${processedImage.documentType}, confidence: ${processedImage.ocrConf.toFixed(1)}%`)
        console.log(`   Lines extracted: ${processedImage.extractedData.lines.length}`)
        console.log(`   OCR text length: ${processedImage.ocrText.length} chars`)

        const { data: fileRecord, error: dbError } = await supabase
          .from('files')
          .insert({
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            ocr_text: processedImage.ocrText,
            ocr_confidence: Math.round(processedImage.ocrConf),
            document_type: processedImage.documentType,
            extracted_fields: JSON.stringify(processedImage.extractedData),
            processing_time: Date.now()
          })
          .select()
          .single()

        if (dbError) {
          console.error('❌ Database error saving file:', dbError)
        } else {
          console.log(`💾 File saved to database with ID: ${fileRecord.id}`)
        }

      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error)
        return NextResponse.json(
          { error: `Failed to process file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 500 }
        )
      }
    }

    console.log('🔀 Starting case fusion...')
    const fusedCase: ChatCaseInput = CaseFusion.fuseCase(processedImages, narrative, benefits)

    console.log('🎯 Classifying intent...')
    const intentClassification = IntentClassifier.classifyIntent(fusedCase)
    console.log(`   Primary intent: ${intentClassification.primaryIntent} (confidence: ${(intentClassification.confidence * 100).toFixed(1)}%)`)

    if (intentClassification.clarificationNeeded) {
      console.log(`❓ Clarification needed: ${intentClassification.suggestedQuestion}`)
    }

    console.log('🔍 Running rules engine...')
    const detections = RulesEngine.analyzeCase(fusedCase)
    console.log(`   Detections found: ${detections.length}`)

    detections.forEach((detection, i) => {
      console.log(`     ${i + 1}. [${detection.severity.toUpperCase()}] ${detection.category}: ${detection.explanation.substring(0, 100)}...`)
    })

    console.log('📋 Generating answer pack...')
    const answerPack: ChatAnswer = AnswerPackGenerator.generateAnswerPack(
      fusedCase,
      intentClassification,
      detections
    )

    console.log(`   Phone scripts: ${answerPack.scriptsAndLetters.phoneScripts.length}`)
    console.log(`   Appeal letters: ${answerPack.scriptsAndLetters.appealLetters.length}`)
    console.log(`   Next steps: ${answerPack.nextSteps.length}`)

    const sessionId = `enhanced_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .insert({
          session_id: sessionId,
          user_question: redactSensitiveInfo(narrative),
          user_benefits: benefits,
          llm_response: {
            narrative_summary: answerPack.analysis.summary,
            step_by_step: answerPack.nextSteps.map(step => step.label),
            errors_detected: detections.map(d => d.explanation),
            phone_script: answerPack.scriptsAndLetters.phoneScripts[0]?.script,
            appeal_letter: answerPack.scriptsAndLetters.appealLetters[0]?.letterContent,
            citations: detections.flatMap(d => d.policyCitations.map(c => ({
              label: c.title,
              reference: c.citation
            }))),
            confidence: Math.round(intentClassification.confidence * 100)
          },
          status: 'active',
          intent_classification: {
            primary_intent: intentClassification.primaryIntent,
            secondary_intents: intentClassification.secondaryIntents,
            confidence: intentClassification.confidence,
            clarification_needed: intentClassification.clarificationNeeded
          },
          detections_found: detections.map(d => ({
            id: d.id,
            category: d.category,
            severity: d.severity,
            explanation: d.explanation,
            math_delta: d.mathDelta
          }))
        })
        .select()
        .single()

      if (caseError) {
        console.error('❌ Error creating case:', caseError)
      } else {
        console.log(`💾 Case saved with ID: ${caseData.id}`)
      }
    } catch (dbError) {
      console.error('❌ Database error:', dbError)
    }

    const response = {
      success: true,
      sessionId,
      intent: intentClassification,
      extractionTable: answerPack.extractionTable,
      analysis: answerPack.analysis,
      scriptsAndLetters: answerPack.scriptsAndLetters,
      nextSteps: answerPack.nextSteps,
      disclaimers: answerPack.disclaimers,
      processedFiles: processedImages.map(img => ({
        artifactId: img.artifactId,
        documentType: img.documentType,
        confidence: img.ocrConf,
        linesExtracted: img.extractedData.lines.length
      }))
    }

    console.log('✅ Enhanced chat ingest completed successfully')
    return NextResponse.json(response)

  } catch (error: any) {
    console.error('❌ Enhanced chat ingest error:', error)

    const fallbackResponse = {
      success: false,
      error: 'Processing failed',
      extractionTable: {
        header: {},
        lines: [],
        notes: ['Image processing failed - please try uploading clearer images']
      },
      analysis: {
        summary: "I encountered technical difficulties processing your images, but I can still provide some general guidance based on your description.",
        likelyIssues: []
      },
      scriptsAndLetters: {
        phoneScripts: [{
          id: 'general_billing_inquiry',
          title: 'General Billing Office Call',
          scenario: 'Call the provider billing office about your concern',
          script: `Hi, I'm calling about my medical bill and have some questions about the charges. Could you please review my account and help me understand the billing? I'd like to make sure everything is accurate before making payment.`,
          parameters: {}
        }],
        appealLetters: []
      },
      nextSteps: [
        { label: 'Try uploading clearer images for better analysis' },
        { label: 'Contact your provider\'s billing office directly' },
        { label: 'Request an itemized bill if you don\'t have one' },
        { label: 'Keep all documentation for your records' }
      ],
      disclaimers: [
        'This analysis provides educational information, not legal or medical advice.',
        'Always verify information with your insurance company and healthcare providers.'
      ]
    }

    return NextResponse.json(fallbackResponse, { status: 200 })
  }
}

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