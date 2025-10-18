import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth, createAdminResponse } from '@/lib/admin/auth'
import { extractTextFromFileEnhanced } from '@/lib/ocr/extract-enhanced'
import { getOCRStats, validateOCRResults } from '@/lib/ocr/extract'
import { normalizeTraditionalOCRToLines } from '@/lib/ocr/normalize-enhanced'
import { extractHeaderInfo, extractTotalsFromHeader } from '@/lib/ocr/header'
import { createEOBSummary } from '@/lib/ocr/eob-parser'
import { matchBillToEOBLines, calculateTotalAllowedBasisSavings, getMatchingStats } from '@/lib/matching/line-matcher'
import { runEnhancedRuleEngine } from '@/lib/rules/run18-enhanced'
import { computeEnhancedSavings } from '@/lib/rules/savings-enhanced'
import { FileRef, AnalysisResult, PricedSummary, EnhancedAnalysisResult, InsurancePlan } from '@/lib/types/ocr'

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  const startTime = Date.now()

  try {
    console.log(`🔬 Starting OCR & Analysis for case ${params.caseId} - v2.0`)

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

    // Separate bills and EOBs
    const billFiles = files.filter(file => !file.document_type || file.document_type === 'bill')
    const eobFiles = files.filter(file => file.document_type === 'eob')

    console.log(`📋 Bills: ${billFiles.length}, EOBs: ${eobFiles.length}`)

    // 2. Convert to FileRef format
    console.log('🔄 Step 3: Converting files to FileRef format...')
    const billFileRefs: FileRef[] = billFiles.map(file => ({
      fileId: file.id,
      storagePath: file.storage_path,
      mime: file.mime,
      sizeBytes: file.size_bytes
    }))

    const eobFileRefs: FileRef[] = eobFiles.map(file => ({
      fileId: file.id,
      storagePath: file.storage_path,
      mime: file.mime,
      sizeBytes: file.size_bytes
    }))

    const fileRefs: FileRef[] = [...billFileRefs, ...eobFileRefs]

    // 3. Perform Enhanced OCR on all files (OpenAI Vision → GCV → Tesseract)
    console.log('🔍 Step 4: Starting enhanced OCR extraction...')
    console.log('🔍 Processing files:', fileRefs.map(f => ({ id: f.fileId, path: f.storagePath, mime: f.mime })))

    const tempBucketName = process.env.STORAGE_BUCKET // Use main bucket for temp processing

    if (!tempBucketName) {
      throw new Error('STORAGE_BUCKET environment variable not configured')
    }

    console.log(`🪣 Using storage bucket: ${tempBucketName}`)

    let ocrResults: Record<string, import('@/lib/types/ocr').OCRResult> = {};

    // Process files in parallel to avoid timeout
    const ocrPromises = fileRefs.map(async (fileRef) => {
      try {
        console.log(`🤖 Processing ${fileRef.fileId} with enhanced OCR...`)
        const result = await extractTextFromFileEnhanced(fileRef, params.caseId, tempBucketName)
        console.log(`✅ ${fileRef.fileId}: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.pages?.length || 0} pages`)
        return { fileId: fileRef.fileId, result }
      } catch (ocrError) {
        console.error(`❌ Enhanced OCR failed for ${fileRef.fileId}:`, ocrError)
        // Create failed result
        const failedResult = {
          vendor: 'openai',
          pages: [],
          processingTimeMs: 0,
          success: false,
          error: ocrError instanceof Error ? ocrError.message : String(ocrError)
        } as import('@/lib/types/ocr').OCRResult
        return { fileId: fileRef.fileId, result: failedResult }
      }
    })

    // Wait for all OCR operations to complete with a timeout
    try {
      const results = await Promise.allSettled(ocrPromises)

      results.forEach((result, index) => {
        const fileRef = fileRefs[index]
        if (result.status === 'fulfilled') {
          ocrResults[result.value.fileId] = result.value.result
        } else {
          console.error(`❌ OCR promise failed for ${fileRef.fileId}:`, result.reason)
          ocrResults[fileRef.fileId] = {
            vendor: 'openai',
            pages: [],
            processingTimeMs: 0,
            success: false,
            error: 'OCR processing timeout or error'
          }
        }
      })
    } catch (error) {
      console.error('❌ OCR parallel processing failed:', error)
      throw new Error(`OCR parallel processing failed: ${error}`)
    }

    // 4. Validate OCR results
    const validation = validateOCRResults(ocrResults)
    console.log(`✅ OCR completed: ${validation.valid.length} successful, ${validation.invalid.length} failed`)

    if (validation.warnings.length > 0) {
      console.warn('⚠️ OCR warnings:', validation.warnings)
    }

    // 5. Normalize OCR text to structured lines (bills only)
    console.log('📝 Normalizing bill OCR text to structured data...')
    const billOCRResults: Record<string, import('@/lib/types/ocr').OCRResult> = {}
    const eobOCRResults: Record<string, import('@/lib/types/ocr').OCRResult> = {}

    // Separate OCR results by file type
    for (const [fileId, result] of Object.entries(ocrResults)) {
      const file = files.find(f => f.id === fileId)
      if (file?.document_type === 'eob') {
        eobOCRResults[fileId] = result
      } else {
        billOCRResults[fileId] = result
      }
    }

    const parsedLines = normalizeTraditionalOCRToLines(billOCRResults)
    console.log(`📊 Extracted ${parsedLines.length} billing lines from ${Object.keys(billOCRResults).length} bill files`)

    // Process EOB files if any
    let eobSummary = null
    if (Object.keys(eobOCRResults).length > 0) {
      console.log(`📋 Processing ${Object.keys(eobOCRResults).length} EOB files...`)
      eobSummary = createEOBSummary(eobOCRResults)
      console.log(`📋 Extracted ${eobSummary?.lines.length || 0} EOB lines`)
    }

    // 6. Extract header information (from bills)
    const headerInfo = extractHeaderInfo(billOCRResults)
    console.log('🏥 Extracted header info:', headerInfo)

    // 7. Load insurance plan data from case profile
    console.log('💳 Loading insurance plan data from case profile...')
    let insurancePlan: InsurancePlan | null = null
    try {
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('case_profile')
        .select('insurance')
        .eq('case_id', params.caseId)
        .single()

      if (profileData?.insurance && Object.keys(profileData.insurance).length > 0) {
        insurancePlan = profileData.insurance as InsurancePlan
        console.log('💳 Found insurance plan data:', Object.keys(insurancePlan))
      } else {
        console.log('💳 No insurance plan data found in case profile')
      }
    } catch (error) {
      console.warn('⚠️ Could not load insurance plan data:', error)
    }

    // 8. Extract totals from header and calculate from lines
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

    // 9. Run enhanced 18-rule engine
    console.log('🔍 Running enhanced 18-rule analysis...')
    const detections = runEnhancedRuleEngine(pricedSummary)
    console.log(`🚨 Found ${detections.length} potential issues`)

    // 10. Calculate enhanced savings with hierarchy (allowed → plan → charge)
    const savingsResult = computeEnhancedSavings(detections, pricedSummary, eobSummary || undefined, insurancePlan || undefined)
    console.log(`💰 Total enhanced savings: $${(savingsResult.savingsTotalCents / 100).toFixed(2)} (${savingsResult.basis}-basis)`)

    // Enhanced savings computation already includes line matching
    const { detections: detectionsWithSavings, lineMatches: enhancedLineMatches, impactedLines } = savingsResult
    let allowedBasisSavingsCents = 0

    // Convert enhanced line matches to legacy format for backward compatibility
    const lineMatches: import('@/lib/types/ocr').LineMatch[] = enhancedLineMatches.map(match => ({
      billLineId: match.billLine.lineId,
      eobLineId: match.eobLine?.lineId,
      matchConfidence: match.matchScore / 100, // Convert score to confidence 0-1
      matchType: match.matchType,
      allowedBasisSavings: match.eobLine?.patientResp
    }))

    if (eobSummary && eobSummary.lines.length > 0 && parsedLines.length > 0) {
      const matchStats = getMatchingStats(lineMatches)
      console.log(`🔗 Line matching results:`)
      console.log(`   - Total lines: ${matchStats.totalLines}`)
      console.log(`   - Exact matches: ${matchStats.exactMatches}`)
      console.log(`   - Fuzzy matches: ${matchStats.fuzzyMatches}`)
      console.log(`   - Unmatched: ${matchStats.unmatchedLines}`)
      console.log(`   - Match rate: ${(matchStats.matchRate * 100).toFixed(1)}%`)

      // Calculate traditional allowed-basis savings for comparison
      allowedBasisSavingsCents = calculateTotalAllowedBasisSavings(lineMatches)
      console.log(`💰 Traditional allowed-basis savings: $${(allowedBasisSavingsCents / 100).toFixed(2)}`)
    } else {
      console.log('⚠️ No EOB data available for line matching')
    }

    // 12. Store enhanced analysis result temporarily in case_reports for report generation
    console.log('📋 Storing enhanced analysis result for report generation')
    const analysisDataToStore = {
      pricedSummary,
      detections: detectionsWithSavings,
      savingsTotalCents: savingsResult.savingsTotalCents,
      eobSummary: eobSummary || undefined,
      insurancePlan: insurancePlan || undefined,
      lineMatches,
      allowedBasisSavingsCents,
      savingsBasis: savingsResult.basis
    }

    // Critical: Check for PDF contamination before storing
    const analysisDataString = JSON.stringify(analysisDataToStore)
    if (analysisDataString.includes('%PDF')) {
      console.error('❌ CRITICAL: Analysis data contains PDF contamination before storage!')
      console.error('❌ Contaminated section:', analysisDataString.slice(analysisDataString.indexOf('%PDF') - 50, analysisDataString.indexOf('%PDF') + 100))
      throw new Error('Analysis data contains PDF contamination - storage aborted')
    }

    await storeAnalysisResultForReport(params.caseId, analysisDataToStore)

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

    // 15. Prepare enhanced analysis result
    const analysisResult: EnhancedAnalysisResult = {
      caseId: params.caseId,
      pricedSummary,
      detections: detectionsWithSavings,
      savingsTotalCents: savingsResult.savingsTotalCents,
      eobSummary: eobSummary || undefined,
      insurancePlan: insurancePlan || undefined,
      lineMatches,
      allowedBasisSavingsCents
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

  // Prepare extraction records with complete schema mapping
  const extractionRecords = parsedLines.map((line, index) => ({
    case_id: caseId,
    page: line.page || 1,
    row_idx: index + 1,
    code: line.code || null,
    code_system: line.codeSystem || null,
    description: line.description || null,
    charge_cents: line.charge || null,
    allowed_cents: line.allowed || null,
    plan_paid_cents: line.planPaid || null,
    patient_resp_cents: line.patientResp || null,
    dos: line.dos ? new Date(line.dos) : null,
    low_conf: line.lowConf || false,
    conf: line.conf || 0.8,
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
    evidence: detection.evidence || null
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

/**
 * Store analysis result temporarily for report generation
 */
async function storeAnalysisResultForReport(caseId: string, analysisResult: any) {
  try {
    const { error } = await supabaseAdmin
      .from('case_reports')
      .upsert({
        case_id: caseId,
        analysis_data: analysisResult,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'case_id'
      })

    if (error) {
      console.error('Failed to store analysis result:', error)
      throw new Error(`Failed to store analysis result: ${error.message}`)
    }

    console.log('✅ Analysis result stored for report generation')
  } catch (error) {
    console.error('Failed to store analysis result:', error)
    // Don't throw - this is not critical for OCR analysis to succeed
  }
}