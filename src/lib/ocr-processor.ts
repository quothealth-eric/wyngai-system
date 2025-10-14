import { ImageAnnotatorClient } from '@google-cloud/vision'

interface OCRFacts {
  codes: {
    type: 'CPT' | 'HCPCS' | 'ICD10' | 'REV' | 'POS'
    code: string
    description?: string
    line_context: string
  }[]
  dates: {
    type: 'DOS' | 'denial_date' | 'received_date'
    date: string
    line_context: string
  }[]
  amounts: {
    type: 'billed' | 'allowed' | 'paid' | 'patient_responsibility'
    amount: number
    line_context: string
  }[]
  entities: {
    payer?: string
    provider?: string
    facility?: string
    patient_name?: string
    member_id?: string
    claim_number?: string
  }
  network_indicators: {
    indicator: 'in_network' | 'out_of_network' | 'emergency'
    evidence: string
  }[]
  denial_reasons: string[]
  raw_text: string
}

let visionClient: ImageAnnotatorClient | null = null

function initializeVisionClient() {
  if (visionClient) return visionClient

  try {
    console.log('🔍 Initializing Google Cloud Vision client...')

    // Check for credentials
    const hasCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CREDENTIALS_JSON
    const hasProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID

    console.log('📋 Environment check:')
    console.log(`  - GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? '✓' : '❌'}`)
    console.log(`  - GOOGLE_CLOUD_PROJECT_ID: ${hasProjectId ? '✓' : '❌'}`)

    if (!hasCredentials || !hasProjectId) {
      console.error('❌ Missing required environment variables for Google Cloud Vision')
      return null
    }

    // Initialize with explicit project ID if available
    const clientOptions: any = {}
    if (hasProjectId) {
      clientOptions.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID
    }

    visionClient = new ImageAnnotatorClient(clientOptions)
    console.log('✅ Google Cloud Vision client initialized')
    return visionClient
  } catch (error) {
    console.error('❌ Failed to initialize Vision client:', error)
    return null
  }
}

// Extract medical codes using patterns
function extractMedicalCodes(text: string): OCRFacts['codes'] {
  const codes: OCRFacts['codes'] = []
  const lines = text.split('\n')

  // CPT codes (5 digits, sometimes with modifiers)
  const cptPattern = /\b(\d{5})(?:-(\w{2}))?\b/g
  // HCPCS codes (letter + 4 digits)
  const hcpcsPattern = /\b([A-Z]\d{4})\b/g
  // ICD-10 codes (letter + digits + optional decimal + digits)
  const icd10Pattern = /\b([A-Z]\d{2}(?:\.\d{1,4})?)\b/g
  // Revenue codes (4 digits, usually 0xxx)
  const revPattern = /\b(0\d{3})\b/g

  lines.forEach(line => {
    let match

    // CPT codes
    while ((match = cptPattern.exec(line)) !== null) {
      const code = match[1]
      const modifier = match[2]
      codes.push({
        type: 'CPT',
        code: modifier ? `${code}-${modifier}` : code,
        line_context: line.trim()
      })
    }

    // HCPCS codes
    while ((match = hcpcsPattern.exec(line)) !== null) {
      codes.push({
        type: 'HCPCS',
        code: match[1],
        line_context: line.trim()
      })
    }

    // ICD-10 codes
    while ((match = icd10Pattern.exec(line)) !== null) {
      codes.push({
        type: 'ICD10',
        code: match[1],
        line_context: line.trim()
      })
    }

    // Revenue codes
    while ((match = revPattern.exec(line)) !== null) {
      codes.push({
        type: 'REV',
        code: match[1],
        line_context: line.trim()
      })
    }
  })

  return codes
}

// Extract dates
function extractDates(text: string): OCRFacts['dates'] {
  const dates: OCRFacts['dates'] = []
  const lines = text.split('\n')

  // Common date patterns
  const datePatterns = [
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g,        // MM/DD/YYYY
    /\b(\d{1,2}-\d{1,2}-\d{4})\b/g,          // MM-DD-YYYY
    /\b(\w{3}\s+\d{1,2},?\s+\d{4})\b/g,      // Jan 15, 2024
    /\b(\d{4}-\d{2}-\d{2})\b/g               // YYYY-MM-DD
  ]

  lines.forEach(line => {
    const lineLower = line.toLowerCase()

    // Service dates
    if (lineLower.includes('service') || lineLower.includes('dos') || lineLower.includes('date of service')) {
      datePatterns.forEach(pattern => {
        let match
        while ((match = pattern.exec(line)) !== null) {
          dates.push({
            type: 'DOS',
            date: match[1],
            line_context: line.trim()
          })
        }
      })
    }

    // Denial dates
    if (lineLower.includes('denied') || lineLower.includes('rejection') || lineLower.includes('decline')) {
      datePatterns.forEach(pattern => {
        let match
        while ((match = pattern.exec(line)) !== null) {
          dates.push({
            type: 'denial_date',
            date: match[1],
            line_context: line.trim()
          })
        }
      })
    }
  })

  return dates
}

// Extract dollar amounts
function extractAmounts(text: string): OCRFacts['amounts'] {
  const amounts: OCRFacts['amounts'] = []
  const lines = text.split('\n')

  // Money patterns
  const moneyPattern = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g

  lines.forEach(line => {
    const lineLower = line.toLowerCase()
    let match

    while ((match = moneyPattern.exec(line)) !== null) {
      const amount = parseFloat(match[1].replace(',', ''))
      let type: OCRFacts['amounts'][0]['type'] = 'billed'

      if (lineLower.includes('billed') || lineLower.includes('charge')) {
        type = 'billed'
      } else if (lineLower.includes('allowed') || lineLower.includes('covered')) {
        type = 'allowed'
      } else if (lineLower.includes('paid') || lineLower.includes('payment')) {
        type = 'paid'
      } else if (lineLower.includes('patient') || lineLower.includes('deductible') || lineLower.includes('copay') || lineLower.includes('coinsurance')) {
        type = 'patient_responsibility'
      }

      amounts.push({
        type,
        amount,
        line_context: line.trim()
      })
    }
  })

  return amounts
}

// Extract key entities
function extractEntities(text: string): OCRFacts['entities'] {
  const entities: OCRFacts['entities'] = {}
  const lines = text.split('\n')

  // Common payer names
  const payers = ['aetna', 'united', 'cigna', 'anthem', 'bcbs', 'blue cross', 'humana', 'kaiser', 'medicare', 'medicaid']

  lines.forEach(line => {
    const lineLower = line.toLowerCase()

    // Payer detection
    for (const payer of payers) {
      if (lineLower.includes(payer)) {
        entities.payer = payer
        break
      }
    }

    // Member ID
    const memberIdMatch = line.match(/member\s*(?:id|#)?\s*:?\s*(\w+)/i)
    if (memberIdMatch) {
      entities.member_id = memberIdMatch[1]
    }

    // Claim number
    const claimMatch = line.match(/claim\s*(?:number|#)?\s*:?\s*(\w+)/i)
    if (claimMatch) {
      entities.claim_number = claimMatch[1]
    }
  })

  return entities
}

// Detect network status indicators
function detectNetworkIndicators(text: string): OCRFacts['network_indicators'] {
  const indicators: OCRFacts['network_indicators'] = []
  const textLower = text.toLowerCase()

  if (textLower.includes('out of network') || textLower.includes('oon') || textLower.includes('non-participating')) {
    indicators.push({
      indicator: 'out_of_network',
      evidence: 'Document contains out-of-network language'
    })
  }

  if (textLower.includes('in network') || textLower.includes('participating provider')) {
    indicators.push({
      indicator: 'in_network',
      evidence: 'Document contains in-network language'
    })
  }

  if (textLower.includes('emergency') || textLower.includes('urgent') || textLower.includes('er ')) {
    indicators.push({
      indicator: 'emergency',
      evidence: 'Document contains emergency service language'
    })
  }

  return indicators
}

// Extract denial reasons
function extractDenialReasons(text: string): string[] {
  const denialReasons: string[] = []
  const lines = text.split('\n')

  const denialKeywords = [
    'denied', 'rejection', 'decline', 'not covered', 'excluded',
    'prior authorization', 'preauth', 'medical necessity',
    'benefit limitation', 'exceeded', 'duplicate'
  ]

  lines.forEach(line => {
    const lineLower = line.toLowerCase()
    for (const keyword of denialKeywords) {
      if (lineLower.includes(keyword)) {
        denialReasons.push(line.trim())
        break
      }
    }
  })

  return Array.from(new Set(denialReasons)) // Remove duplicates
}

export async function processOCR(fileBuffer: Buffer, mimeType: string): Promise<OCRFacts | null> {
  try {
    console.log(`📄 Starting OCR processing for ${mimeType}...`)

    const client = initializeVisionClient()
    if (!client) {
      console.error('❌ Vision client not available')
      return null
    }

    let textAnnotation: string = ''

    if (mimeType.startsWith('image/')) {
      // Sync processing for images
      console.log('📸 Processing image with documentTextDetection...')
      const [result] = await client.documentTextDetection({
        image: { content: fileBuffer }
      })

      textAnnotation = result.fullTextAnnotation?.text || ''
    } else if (mimeType === 'application/pdf' || mimeType.includes('tiff')) {
      // Async processing for PDFs and TIFFs
      console.log('📑 Processing PDF/TIFF with asyncBatchAnnotateFiles...')

      const request = {
        requests: [{
          inputConfig: {
            content: fileBuffer,
            mimeType: mimeType
          },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' as const }],
          outputConfig: {
            gcsDestination: undefined, // We'll get results directly
            batchSize: 1
          }
        }]
      }

      const [operation] = await client.asyncBatchAnnotateFiles(request)
      console.log('⏳ Waiting for async OCR operation to complete...')

      const [filesResult] = await operation.promise()
      if (filesResult.responses && filesResult.responses[0] && filesResult.responses[0].responses && filesResult.responses[0].responses[0]) {
        textAnnotation = filesResult.responses[0].responses[0].fullTextAnnotation?.text || ''
      }
    } else {
      console.error(`❌ Unsupported file type: ${mimeType}`)
      return null
    }

    if (!textAnnotation) {
      console.warn('⚠️ No text extracted from document')
      return {
        codes: [],
        dates: [],
        amounts: [],
        entities: {},
        network_indicators: [],
        denial_reasons: [],
        raw_text: ''
      }
    }

    console.log(`📝 Extracted ${textAnnotation.length} characters of text`)

    // Extract structured facts
    const facts: OCRFacts = {
      codes: extractMedicalCodes(textAnnotation),
      dates: extractDates(textAnnotation),
      amounts: extractAmounts(textAnnotation),
      entities: extractEntities(textAnnotation),
      network_indicators: detectNetworkIndicators(textAnnotation),
      denial_reasons: extractDenialReasons(textAnnotation),
      raw_text: textAnnotation
    }

    console.log(`🔍 OCR extraction complete:`)
    console.log(`  - ${facts.codes.length} medical codes`)
    console.log(`  - ${facts.dates.length} dates`)
    console.log(`  - ${facts.amounts.length} dollar amounts`)
    console.log(`  - ${facts.network_indicators.length} network indicators`)
    console.log(`  - ${facts.denial_reasons.length} denial reasons`)

    return facts

  } catch (error) {
    console.error('❌ OCR processing error:', error)
    return null
  }
}