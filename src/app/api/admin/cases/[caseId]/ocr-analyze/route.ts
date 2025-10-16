import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth, createAdminResponse } from '@/lib/admin/auth'
import { extractTextFromFiles, getOCRStats, validateOCRResults } from '@/lib/ocr/extract'
import { normalizeOCRToLines } from '@/lib/ocr/normalize'
import { extractHeaderInfo, extractTotalsFromHeader } from '@/lib/ocr/header'
import { runRuleEngine } from '@/lib/rules/run18'
import { calculateTotalSavings } from '@/lib/rules/savings'
import { FileRef, AnalysisResult, PricedSummary } from '@/lib/types/ocr'

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  const startTime = Date.now()

  try {
    console.log(`🔬 Starting OCR & Analysis for case ${params.caseId}`)

    // 1. Load case and files
    console.log('📊 Step 1: Loading case data from database...')
    const { data: caseData, error: caseError } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('case_id', params.caseId)
      .single()

    if (caseError || !caseData) {
      return NextResponse.json(
        { error: 'Case not found', details: caseError?.message },
        { status: 404 }
      )
    }

    console.log('📁 Step 2: Loading case files from database...')
    const { data: files, error: filesError } = await supabaseAdmin
      .from('case_files')
      .select('*')
      .eq('case_id', params.caseId)
      .order('uploaded_at', { ascending: true })

    if (filesError || !files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files found for analysis', details: filesError?.message },
        { status: 400 }
      )
    }

    console.log(`📁 Found ${files.length} files for OCR processing`)

    // 2. Convert to FileRef format
    console.log('🔄 Step 3: Converting files to FileRef format...')
    const fileRefs: FileRef[] = files.map(file => ({
      fileId: file.id,
      storagePath: file.storage_path,
      mime: file.mime,
      sizeBytes: file.size_bytes
    }))

    // 3. Perform OCR on all files
    console.log('🔍 Step 4: Starting OCR extraction...')
    const tempBucketName = process.env.STORAGE_BUCKET // Use main bucket for temp processing

    if (!tempBucketName) {
      throw new Error('STORAGE_BUCKET environment variable not configured')
    }

    console.log(`🪣 Using storage bucket: ${tempBucketName}`)

    const ocrResults = await extractTextFromFiles(fileRefs, tempBucketName)

    // 4. Validate OCR results
    const validation = validateOCRResults(ocrResults)
    console.log(`✅ OCR completed: ${validation.valid.length} successful, ${validation.invalid.length} failed`)

    if (validation.warnings.length > 0) {
      console.warn('⚠️ OCR warnings:', validation.warnings)
    }

    // 5. Normalize OCR text to structured lines
    console.log('📝 Normalizing OCR text to structured data...')
    const parsedLines = normalizeOCRToLines(ocrResults)
    console.log(`📊 Extracted ${parsedLines.length} billing lines`)

    // 6. Extract header information
    const headerInfo = extractHeaderInfo(ocrResults)
    console.log('🏥 Extracted header info:', headerInfo)

    // 7. Extract totals from header and calculate from lines
    const allText = Object.values(ocrResults)
      .filter(result => result.success && result.pages)
      .flatMap(result => result.pages.map(page => page.text))
      .join('\n\n')
    const headerTotals = extractTotalsFromHeader(allText)
    const calculatedTotals = calculateTotalsFromLines(parsedLines)

    // Prefer header totals if available, fall back to calculated
    const totals = {
      billed: headerTotals.billed || calculatedTotals.billed,
      allowed: headerTotals.allowed || calculatedTotals.allowed,
      planPaid: headerTotals.planPaid || calculatedTotals.planPaid,
      patientResp: headerTotals.patientResp || calculatedTotals.patientResp
    }

    // 8. Build PricedSummary
    const pricedSummary: PricedSummary = {
      header: headerInfo,
      totals,
      lines: parsedLines
    }

    // 9. Run 18-rule engine
    console.log('🔍 Running 18-rule analysis...')
    const detections = runRuleEngine(pricedSummary)
    console.log(`🚨 Found ${detections.length} potential issues`)

    // 10. Calculate savings
    const { savingsTotalCents, detections: detectionsWithSavings } = calculateTotalSavings(detections, pricedSummary)
    console.log(`💰 Total potential savings: $${(savingsTotalCents / 100).toFixed(2)}`)

    // 11. Persist OCR extractions to database
    await persistOCRExtractions(params.caseId, parsedLines, ocrResults)

    // 12. Persist detections to database
    await persistDetections(params.caseId, detectionsWithSavings)

    // 13. Update case status
    await supabaseAdmin
      .from('cases')
      .update({
        status: 'ready',
        updated_at: new Date().toISOString()
      })
      .eq('case_id', params.caseId)

    // 14. Prepare analysis result
    const analysisResult: AnalysisResult = {
      caseId: params.caseId,
      pricedSummary,
      detections: detectionsWithSavings,
      savingsTotalCents
    }

    const processingTime = Date.now() - startTime
    console.log(`✅ OCR & Analysis completed in ${processingTime}ms`)

    // 15. Log processing statistics
    const ocrStats = getOCRStats(ocrResults)
    console.log('📈 OCR Statistics:', ocrStats)

    return createAdminResponse({
      success: true,
      caseId: params.caseId,
      processingTimeMs: processingTime,
      ocrStats,
      analysis: analysisResult,
      validation
    })

  } catch (error) {
    console.error('❌ OCR & Analysis failed:', error)
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('❌ Error name:', error instanceof Error ? error.name : 'Unknown')
    console.error('❌ Error message:', error instanceof Error ? error.message : String(error))

    // Log additional context
    console.error('❌ Case ID:', params.caseId)
    console.error('❌ Environment variables check:', {
      STORAGE_BUCKET: !!process.env.STORAGE_BUCKET,
      GOOGLE_APPLICATION_CREDENTIALS_JSON: !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
      GCP_SA_KEY_B64: !!process.env.GCP_SA_KEY_B64,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    })

    // Update case status to indicate error
    try {
      await supabaseAdmin
        .from('cases')
        .update({
          status: 'error',
          updated_at: new Date().toISOString()
        })
        .eq('case_id', params.caseId)
    } catch (statusError) {
      console.error('Failed to update case status:', statusError)
    }

    // Return detailed error information
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorDetails = {
      message: errorMessage,
      name: error instanceof Error ? error.name : 'UnknownError',
      stack: error instanceof Error ? error.stack : undefined,
      caseId: params.caseId
    }

    console.error('❌ Returning error response:', errorDetails)

    return NextResponse.json(
      {
        error: 'OCR & Analysis failed',
        details: errorMessage,
        debugInfo: errorDetails,
        caseId: params.caseId
      },
      { status: 500 }
    )
  }
}

/**
 * Calculate totals from parsed lines
 */
function calculateTotalsFromLines(lines: import('@/lib/types/ocr').ParsedLine[]): PricedSummary['totals'] {
  const totals = {
    billed: 0,
    allowed: 0,
    planPaid: 0,
    patientResp: 0
  }

  for (const line of lines) {
    if (line.charge) totals.billed += line.charge
    if (line.allowed) totals.allowed += line.allowed
    if (line.planPaid) totals.planPaid += line.planPaid
    if (line.patientResp) totals.patientResp += line.patientResp
  }

  return totals
}

/**
 * Persist OCR extractions to database
 */
async function persistOCRExtractions(
  caseId: string,
  parsedLines: import('@/lib/types/ocr').ParsedLine[],
  ocrResults: Record<string, import('@/lib/types/ocr').OCRResult>
) {
  console.log(`💾 Persisting ${parsedLines.length} extractions to database`)

  // Clear existing extractions
  await supabaseAdmin
    .from('ocr_extractions')
    .delete()
    .eq('case_id', caseId)

  if (parsedLines.length === 0) return

  // Prepare extraction records
  const extractionRecords = parsedLines.map(line => ({
    case_id: caseId,
    line_id: line.lineId,
    page: line.page,
    code: line.code || null,
    code_system: line.codeSystem || null,
    modifiers: line.modifiers || null,
    description: line.description || null,
    units: line.units || null,
    dos: line.dos || null,
    pos: line.pos || null,
    rev_code: line.revCode || null,
    npi: line.npi || null,
    charge_cents: line.charge || null,
    allowed_cents: line.allowed || null,
    plan_paid_cents: line.planPaid || null,
    patient_resp_cents: line.patientResp || null,
    bbox: line.bbox || null,
    confidence: line.conf || null,
    low_confidence: line.lowConf || false,
    created_at: new Date().toISOString()
  }))

  // Insert in batches
  const batchSize = 100
  for (let i = 0; i < extractionRecords.length; i += batchSize) {
    const batch = extractionRecords.slice(i, i + batchSize)

    const { error } = await supabaseAdmin
      .from('ocr_extractions')
      .insert(batch)

    if (error) {
      console.error(`Failed to insert extraction batch ${i}-${i + batch.length}:`, error)
      throw new Error(`Failed to persist OCR extractions: ${error.message}`)
    }
  }

  console.log(`✅ Successfully persisted ${parsedLines.length} extractions`)
}

/**
 * Persist detections to database
 */
async function persistDetections(caseId: string, detections: import('@/lib/types/ocr').Detection[]) {
  console.log(`💾 Persisting ${detections.length} detections to database`)

  // Clear existing detections
  await supabaseAdmin
    .from('case_detections')
    .delete()
    .eq('case_id', caseId)

  if (detections.length === 0) return

  // Prepare detection records
  const detectionRecords = detections.map(detection => ({
    case_id: caseId,
    rule_key: detection.ruleKey,
    severity: detection.severity,
    explanation: detection.explanation,
    evidence: detection.evidence || null,
    created_at: new Date().toISOString()
  }))

  const { error } = await supabaseAdmin
    .from('case_detections')
    .insert(detectionRecords)

  if (error) {
    console.error('Failed to insert detections:', error)
    throw new Error(`Failed to persist detections: ${error.message}`)
  }

  console.log(`✅ Successfully persisted ${detections.length} detections`)
}