import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/db'
import * as crypto from 'crypto'

// OCR Job Interface
export interface OCRJob {
  caseId: string
  artifactId: string
  artifactDigest: string
  storagePath: string
  mimeType: string
  filename: string
}

// Vendor Response Interface
export interface VendorOCRResponse {
  doc_type: 'EOB' | 'BILL' | 'LETTER' | 'PORTAL' | 'INSURANCE_CARD' | 'UNKNOWN'
  header: {
    provider_name?: string
    provider_npi?: string
    payer?: string
    claim_id?: string
    account_id?: string
    service_dates?: { start?: string; end?: string }
    page: number
    artifact_digest: string
  }
  totals: {
    billed?: string
    allowed?: string
    plan_paid?: string
    patient_resp?: string
  }
  rows: Array<{
    code?: string
    code_system?: 'CPT' | 'HCPCS' | 'REV' | 'POS' | null
    modifiers?: string[] | null
    description?: string | null
    units?: number | null
    dos?: string | null
    pos?: string | null
    rev_code?: string | null
    npi?: string | null
    charge?: string | null
    allowed?: string | null
    plan_paid?: string | null
    patient_resp?: string | null
  }>
  keyfacts: {
    denial_reason?: string
    carc_codes?: string[]
    rarc_codes?: string[]
    auth_or_referral?: string
    claim_or_account_ref?: string
    bin?: string
    pcn?: string
    grp?: string
    member_id_masked?: string
  }
}

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Queue OCR job (in-process for now, could be extended to use a queue)
export async function queueOCRJob(job: OCRJob): Promise<void> {
  console.log(`🔍 Queuing OCR job for artifact ${job.artifactId}`)

  // For now, process immediately. In production, you might want to use a job queue
  setTimeout(() => processOCRJob(job), 100)
}

// Main OCR processing function
async function processOCRJob(job: OCRJob): Promise<void> {
  console.log(`🚀 Starting OCR processing for artifact ${job.artifactId}`)

  try {
    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('uploads')
      .download(job.storagePath)

    if (downloadError) {
      console.error(`❌ Failed to download file ${job.storagePath}:`, downloadError)
      return
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer())

    // Verify file integrity
    const actualDigest = crypto.createHash('sha256').update(fileBuffer).digest('hex')
    if (actualDigest !== job.artifactDigest) {
      console.error(`❌ File integrity check failed for ${job.artifactId}`)
      return
    }

    console.log(`✅ File integrity verified for ${job.artifactId}`)

    // Determine number of pages (simplified - assume 1 page for images, could use PDF parsing for PDFs)
    const pageCount = job.mimeType === 'application/pdf' ? 1 : 1 // TODO: Implement proper PDF page counting

    // Process each page
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      await processSinglePage(job, fileBuffer, pageNumber)
    }

    // Update artifact with page count
    await supabase
      .from('artifacts')
      .update({ pages: pageCount })
      .eq('artifact_id', job.artifactId)

    console.log(`✅ OCR processing completed for artifact ${job.artifactId}`)

  } catch (error) {
    console.error(`❌ OCR processing failed for artifact ${job.artifactId}:`, error)
  }
}

// Process a single page with dual-vendor OCR
async function processSinglePage(job: OCRJob, fileBuffer: Buffer, pageNumber: number): Promise<void> {
  console.log(`📄 Processing page ${pageNumber} for artifact ${job.artifactId}`)

  const docTypeGuess = guessDocumentType(job.filename)

  try {
    // Run both vendors in parallel
    const [openaiResult, anthropicResult] = await Promise.allSettled([
      callOpenAIVision(fileBuffer, job.mimeType, pageNumber, job.artifactDigest, docTypeGuess),
      callAnthropicVision(fileBuffer, job.mimeType, pageNumber, job.artifactDigest, docTypeGuess)
    ])

    let openaiResponse: VendorOCRResponse | null = null
    let anthropicResponse: VendorOCRResponse | null = null

    if (openaiResult.status === 'fulfilled') {
      openaiResponse = openaiResult.value
      console.log(`✅ OpenAI Vision completed for page ${pageNumber}`)
    } else {
      console.error(`❌ OpenAI Vision failed for page ${pageNumber}:`, openaiResult.reason)
    }

    if (anthropicResult.status === 'fulfilled') {
      anthropicResponse = anthropicResult.value
      console.log(`✅ Anthropic Vision completed for page ${pageNumber}`)
    } else {
      console.error(`❌ Anthropic Vision failed for page ${pageNumber}:`, anthropicResult.reason)
    }

    // Normalize and fuse results
    const normalizedRows = await normalizeAndFuse(openaiResponse, anthropicResponse, job, pageNumber)

    // Store normalized results in database
    await storeOCRExtractions(job.caseId, job.artifactId, job.artifactDigest, pageNumber, normalizedRows, docTypeGuess)

    console.log(`✅ Page ${pageNumber} processing completed - ${normalizedRows.length} rows extracted`)

  } catch (error) {
    console.error(`❌ Page ${pageNumber} processing failed:`, error)
  }
}

// Call OpenAI Vision API
async function callOpenAIVision(
  fileBuffer: Buffer,
  mimeType: string,
  pageNumber: number,
  artifactDigest: string,
  docTypeGuess: string
): Promise<VendorOCRResponse> {
  const base64Image = fileBuffer.toString('base64')
  const dataUri = `data:${mimeType};base64,${base64Image}`

  const systemPrompt = "You are a verbatim OCR transcriber. Do not infer or guess. If a token is unclear, return null. Output strict JSON only."

  const userPrompt = `You are reading a healthcare ${docTypeGuess} image/page ${pageNumber} of artifact with digest ${artifactDigest}.

Return strict JSON:
{
  "doc_type": one of ["EOB","BILL","LETTER","PORTAL","INSURANCE_CARD","UNKNOWN"],
  "header": {
     "provider_name"?:string, "provider_npi"?:string, "payer"?:string,
     "claim_id"?:string, "account_id"?:string,
     "service_dates"?: {"start"?:string,"end"?:string},
     "page": ${pageNumber}, "artifact_digest": "${artifactDigest}"
  },
  "totals": { "billed"?:string, "allowed"?:string, "plan_paid"?:string, "patient_resp"?:string },
  "rows": [
     {
       "code"?:string, "code_system"?: "CPT"|"HCPCS"|"REV"|"POS"|null,
       "modifiers"?: string[]|null,
       "description"?:string|null,
       "units"?: number|null,
       "dos"?: string|null,
       "pos"?: string|null,
       "rev_code"?: string|null,
       "npi"?: string|null,
       "charge"?: string|null, "allowed"?: string|null, "plan_paid"?: string|null, "patient_resp"?: string|null
     }
  ],
  "keyfacts": { "denial_reason"?:string, "carc_codes"?:string[], "rarc_codes"?:string[], "auth_or_referral"?:string, "claim_or_account_ref"?:string, "bin"?:string, "pcn"?:string, "grp"?:string, "member_id_masked"?:string }
}

Rules:
- Transcribe ONLY what is actually on the page. If not visible → null.
- Each 'rows' entry must correspond to one visible service line that shows a monetary amount.
- For 'code', return exactly the token (e.g., '85025','J1200','A9150','36415','02491','02492'). Do not create codes.
- Money: return as printed, including $ and decimals (e.g., "$938.00").
- Dates: return exactly as printed.

Output strict JSON.`

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: dataUri } }
        ]
      }
    ],
    max_tokens: 4000,
    temperature: 0
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI Vision')
  }

  try {
    return JSON.parse(content) as VendorOCRResponse
  } catch (parseError) {
    console.error('❌ Failed to parse OpenAI response:', content)
    throw new Error('Invalid JSON response from OpenAI Vision')
  }
}

// Call Anthropic Vision API
async function callAnthropicVision(
  fileBuffer: Buffer,
  mimeType: string,
  pageNumber: number,
  artifactDigest: string,
  docTypeGuess: string
): Promise<VendorOCRResponse> {
  const base64Image = fileBuffer.toString('base64')

  const userPrompt = `You are reading a healthcare ${docTypeGuess} image/page ${pageNumber} of artifact with digest ${artifactDigest}.

Return strict JSON:
{
  "doc_type": one of ["EOB","BILL","LETTER","PORTAL","INSURANCE_CARD","UNKNOWN"],
  "header": {
     "provider_name"?:string, "provider_npi"?:string, "payer"?:string,
     "claim_id"?:string, "account_id"?:string,
     "service_dates"?: {"start"?:string,"end"?:string},
     "page": ${pageNumber}, "artifact_digest": "${artifactDigest}"
  },
  "totals": { "billed"?:string, "allowed"?:string, "plan_paid"?:string, "patient_resp"?:string },
  "rows": [
     {
       "code"?:string, "code_system"?: "CPT"|"HCPCS"|"REV"|"POS"|null,
       "modifiers"?: string[]|null,
       "description"?:string|null,
       "units"?: number|null,
       "dos"?: string|null,
       "pos"?: string|null,
       "rev_code"?: string|null,
       "npi"?: string|null,
       "charge"?: string|null, "allowed"?: string|null, "plan_paid"?: string|null, "patient_resp"?: string|null
     }
  ],
  "keyfacts": { "denial_reason"?:string, "carc_codes"?:string[], "rarc_codes"?:string[], "auth_or_referral"?:string, "claim_or_account_ref"?:string, "bin"?:string, "pcn"?:string, "grp"?:string, "member_id_masked"?:string }
}

Rules:
- Transcribe ONLY what is actually on the page. If not visible → null.
- Each 'rows' entry must correspond to one visible service line that shows a monetary amount.
- For 'code', return exactly the token (e.g., '85025','J1200','A9150','36415','02491','02492'). Do not create codes.
- Money: return as printed, including $ and decimals (e.g., "$938.00").
- Dates: return exactly as printed.

You are a verbatim OCR transcriber. Do not infer or guess. If a token is unclear, return null. Output strict JSON only.`

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4000,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as any,
              data: base64Image
            }
          },
          {
            type: "text",
            text: userPrompt
          }
        ]
      }
    ]
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Anthropic')
  }

  try {
    return JSON.parse(content.text) as VendorOCRResponse
  } catch (parseError) {
    console.error('❌ Failed to parse Anthropic response:', content.text)
    throw new Error('Invalid JSON response from Anthropic Vision')
  }
}

// Normalize and fuse vendor responses
async function normalizeAndFuse(
  openaiResponse: VendorOCRResponse | null,
  anthropicResponse: VendorOCRResponse | null,
  job: OCRJob,
  pageNumber: number
): Promise<any[]> {
  console.log(`🔄 Normalizing and fusing results for page ${pageNumber}`)

  const normalizedRows: any[] = []

  if (!openaiResponse && !anthropicResponse) {
    console.log(`⚠️ No valid responses from either vendor for page ${pageNumber}`)
    return normalizedRows
  }

  // Use the response that worked, or fuse if both worked
  const primaryResponse = openaiResponse || anthropicResponse
  const secondaryResponse = openaiResponse && anthropicResponse ? (openaiResponse === primaryResponse ? anthropicResponse : openaiResponse) : null

  if (!primaryResponse) return normalizedRows

  // Process each row from primary response
  primaryResponse.rows.forEach((row, index) => {
    const normalizedRow = {
      row_idx: index + 1,
      doc_type: primaryResponse.doc_type,

      // Structured fields with validation
      code: validateCode(row.code),
      code_system: row.code_system,
      modifiers: row.modifiers,
      description: row.description,
      units: row.units,
      dos: validateDate(row.dos),
      pos: row.pos,
      rev_code: row.rev_code,
      npi: row.npi,

      // Financial fields (convert to cents)
      charge_cents: parseMoneyCents(row.charge),
      allowed_cents: parseMoneyCents(row.allowed),
      plan_paid_cents: parseMoneyCents(row.plan_paid),
      patient_resp_cents: parseMoneyCents(row.patient_resp),

      // Keyfacts for unstructured docs
      keyfacts: primaryResponse.keyfacts,

      // Quality metrics
      low_conf: false, // Will be set based on validation
      vendor_consensus: secondaryResponse ? calculateConsensus(row, secondaryResponse.rows[index]) : 1.0,
      validators: runValidators(row),
      conf: 0.85 // Base confidence
    }

    // Mark as low confidence if validators fail
    if (!normalizedRow.validators.row_has_money || !normalizedRow.validators.regex_pass) {
      normalizedRow.low_conf = true
    }

    // Only include rows that have valid money values (core requirement)
    if (normalizedRow.validators.row_has_money) {
      normalizedRows.push(normalizedRow)
    }
  })

  console.log(`✅ Normalized ${normalizedRows.length} valid rows from page ${pageNumber}`)
  return normalizedRows
}

// Validation functions
function validateCode(code?: string | null): string | null {
  if (!code) return null

  // CPT: 5 digits
  if (/^\d{5}$/.test(code)) return code

  // HCPCS: Letter + 4 digits
  if (/^[A-Z]\d{4}$/.test(code)) return code

  // REV: 3 digits
  if (/^\d{3}$/.test(code)) return code

  // POS: 2 digits
  if (/^\d{2}$/.test(code)) return code

  return null
}

function validateDate(date?: string | null): Date | null {
  if (!date) return null

  try {
    const parsed = new Date(date)
    return isNaN(parsed.getTime()) ? null : parsed
  } catch {
    return null
  }
}

function parseMoneyCents(money?: string | null): number | null {
  if (!money) return null

  const cleaned = money.replace(/[^\d.-]/g, '')
  const parsed = parseFloat(cleaned)

  if (isNaN(parsed)) return null

  return Math.round(parsed * 100) // Convert to cents
}

function runValidators(row: any): any {
  const validators = {
    regex_pass: true,
    row_has_money: false,
    math_check: true
  }

  // Check if row has a money value
  validators.row_has_money = !!(row.charge || row.allowed || row.plan_paid || row.patient_resp)

  // Validate money format
  const moneyRegex = /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/
  validators.regex_pass = !row.charge || moneyRegex.test(row.charge)

  return validators
}

function calculateConsensus(row1: any, row2: any): number {
  if (!row2) return 1.0

  let matches = 0
  let total = 0

  const fields = ['code', 'description', 'charge', 'dos']
  fields.forEach(field => {
    if (row1[field] || row2[field]) {
      total++
      if (row1[field] === row2[field]) {
        matches++
      }
    }
  })

  return total > 0 ? matches / total : 1.0
}

function guessDocumentType(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.includes('eob') || lower.includes('explanation')) return 'EOB'
  if (lower.includes('bill') || lower.includes('statement')) return 'BILL'
  if (lower.includes('letter') || lower.includes('correspondence')) return 'LETTER'
  if (lower.includes('portal') || lower.includes('online')) return 'PORTAL'
  if (lower.includes('insurance') || lower.includes('card')) return 'INSURANCE_CARD'
  return 'UNKNOWN'
}

// Store normalized extractions in database
async function storeOCRExtractions(
  caseId: string,
  artifactId: string,
  artifactDigest: string,
  pageNumber: number,
  rows: any[],
  docType: string
): Promise<void> {
  if (rows.length === 0) {
    console.log(`ℹ️ No valid rows to store for page ${pageNumber}`)
    return
  }

  const insertData = rows.map(row => ({
    case_id: caseId,
    artifact_id: artifactId,
    artifact_digest: artifactDigest,
    page: pageNumber,
    row_idx: row.row_idx,
    doc_type: docType,
    code: row.code,
    code_system: row.code_system,
    modifiers: row.modifiers,
    description: row.description,
    units: row.units,
    dos: row.dos,
    pos: row.pos,
    rev_code: row.rev_code,
    npi: row.npi,
    charge_cents: row.charge_cents,
    allowed_cents: row.allowed_cents,
    plan_paid_cents: row.plan_paid_cents,
    patient_resp_cents: row.patient_resp_cents,
    keyfacts: row.keyfacts,
    low_conf: row.low_conf,
    vendor_consensus: row.vendor_consensus,
    validators: row.validators,
    conf: row.conf
  }))

  const { error } = await supabase
    .from('ocr_extractions')
    .insert(insertData)

  if (error) {
    console.error(`❌ Failed to store OCR extractions:`, error)
    throw error
  }

  console.log(`✅ Stored ${rows.length} OCR extractions for page ${pageNumber}`)
}