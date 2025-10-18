import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth, createAdminResponse } from '@/lib/admin/auth'
import { generateNarrativeContent } from '@/lib/prompts/narrative'
import { generateComprehensivePDF } from '@/lib/reports/comprehensive-pdf'
import { AnalysisResult, EnhancedAnalysisResult, FileRef, ReportDraft } from '@/lib/types/ocr'
import { calculateMemberImpact } from '@/lib/rules/savings-enhanced'

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  const startTime = Date.now()

  try {
    console.log(`📄 Starting report generation for case ${params.caseId}`)

    // 1. Check if case has been analyzed
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

    if (caseData.status !== 'ready') {
      return NextResponse.json(
        { error: 'Case must be analyzed before generating report', status: caseData.status },
        { status: 400 }
      )
    }

    // 2. Load analysis data
    const analysisResult = await loadAnalysisData(params.caseId)
    if (!analysisResult) {
      return NextResponse.json(
        { error: 'No analysis data found. Run OCR & Analysis first.' },
        { status: 400 }
      )
    }

    // Validate analysis data structure
    console.log('📊 Analysis result type:', typeof analysisResult)
    console.log('📊 Analysis result keys:', Object.keys(analysisResult))
    console.log('📊 Analysis caseId:', analysisResult.caseId)
    console.log('📊 Has pricedSummary:', !!analysisResult.pricedSummary)
    console.log('📊 Has detections:', !!analysisResult.detections)
    console.log('📊 savingsTotalCents:', analysisResult.savingsTotalCents)

    // Deep validation of pricedSummary structure
    if (analysisResult.pricedSummary) {
      console.log('📊 PricedSummary keys:', Object.keys(analysisResult.pricedSummary))
      console.log('📊 Has header:', !!analysisResult.pricedSummary.header)
      console.log('📊 Has totals:', !!analysisResult.pricedSummary.totals)
      console.log('📊 Has lines:', !!analysisResult.pricedSummary.lines)
      console.log('📊 Lines count:', analysisResult.pricedSummary.lines?.length || 0)
    }

    // Deep validation of detections
    if (analysisResult.detections) {
      console.log('📊 Detections count:', analysisResult.detections.length)
      console.log('📊 First detection:', analysisResult.detections[0])
    }

    if (!analysisResult.pricedSummary || !analysisResult.detections) {
      console.error('❌ Invalid analysis data structure')
      console.error('❌ Missing pricedSummary:', !analysisResult.pricedSummary)
      console.error('❌ Missing detections:', !analysisResult.detections)
      return NextResponse.json(
        { error: 'Invalid analysis data structure. Please re-run OCR & Analysis.' },
        { status: 400 }
      )
    }

    // 3. Load file references
    const { data: files, error: filesError } = await supabaseAdmin
      .from('case_files')
      .select('*')
      .eq('case_id', params.caseId)
      .order('uploaded_at', { ascending: true })

    if (filesError) {
      return NextResponse.json(
        { error: 'Failed to load files', details: filesError.message },
        { status: 500 }
      )
    }

    const fileRefs: FileRef[] = (files || []).map(file => ({
      fileId: file.id,
      storagePath: file.storage_path,
      mime: file.mime,
      sizeBytes: file.size_bytes
    }))

    // 4. Check for existing report draft or generate new narrative
    let reportDraft = await loadExistingReportDraft(params.caseId)

    if (!reportDraft) {
      console.log('🤖 Generating narrative content with LLM...')

      // Add debug flag to bypass LLM for testing
      const bypassLLM = process.env.BYPASS_LLM === 'true'

      if (bypassLLM) {
        console.log('⚠️ BYPASS_LLM enabled, using fallback narrative directly')
        throw new Error('LLM bypassed for testing')
      }

      try {
        // Add timeout for entire narrative generation
        const narrative = await Promise.race([
          generateNarrativeContent(analysisResult),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Narrative generation timeout after 20 seconds')), 20000)
          )
        ]);

        reportDraft = {
          summary: narrative.summary,
          issues: narrative.issues,
          nextSteps: narrative.nextSteps,
          appealLetter: narrative.appealLetter,
          phoneScript: narrative.phoneScript,
          checklist: narrative.checklist || []
        }

        // Save draft to database
        await saveReportDraft(params.caseId, reportDraft)
        console.log('✅ LLM narrative generated and saved successfully')

      } catch (narrativeError) {
        console.warn('⚠️ LLM narrative generation failed, using fallback:', narrativeError)

        // Use comprehensive fact-based draft based on analysis data
        reportDraft = generateFactBasedReportDraft(analysisResult)

        // Save fallback draft
        await saveReportDraft(params.caseId, reportDraft)
        console.log('✅ Fallback narrative saved successfully')
      }
    } else {
      console.log('✅ Using existing report draft from database')
    }

    // 5. Generate comprehensive PDF report
    console.log('📄 Building comprehensive PDF report...')

    // Transform analysis result to include savings computation
    const allowedCents = analysisResult.allowedBasisSavingsCents || 0
    const savingsResult = {
      detections: analysisResult.detections,
      savingsTotalCents: analysisResult.savingsTotalCents,
      basis: allowedCents > 0 ? 'allowed' : 'charge' as 'allowed' | 'plan' | 'charge',
      lineMatches: [], // Enhanced line matches - would be populated by enhanced savings computation
      impactedLines: new Set<string>() // Would be populated by enhanced savings computation
    }

    const pdfBuffer = await generateComprehensivePDF({
      caseId: analysisResult.caseId,
      pricedSummary: analysisResult.pricedSummary,
      detections: analysisResult.detections,
      savingsResult,
      eobSummary: analysisResult.eobSummary,
      insurancePlan: analysisResult.insurancePlan,
      appealLetter: reportDraft.appealLetter,
      phoneScript: reportDraft.phoneScript,
      checklist: reportDraft.checklist || []
    })

    // 6. Return PDF directly as download instead of storing it
    console.log('📁 Returning PDF directly as download')
    const reportPath = `reports/${params.caseId}/analysis_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`

    // 7. Save report record with path (even though we're not storing the PDF)
    const reportRecord = await saveReportRecord(params.caseId, reportPath, reportDraft)

    const processingTime = Date.now() - startTime
    console.log(`✅ Report generated successfully in ${processingTime}ms`)

    // 8. Return PDF as direct download
    console.log('📁 PDF buffer size:', pdfBuffer.length)
    console.log('📁 PDF buffer type:', typeof pdfBuffer)
    console.log('📁 PDF buffer first 10 bytes:', Array.from(pdfBuffer.slice(0, 10)))

    // Verify PDF buffer starts with PDF header
    const pdfHeader = Array.from(pdfBuffer.slice(0, 4))
    const expectedHeader = [0x25, 0x50, 0x44, 0x46] // %PDF
    const isValidPDF = pdfHeader.every((byte, index) => byte === expectedHeader[index])
    console.log('📁 PDF header validation:', isValidPDF ? 'VALID' : 'INVALID')

    if (!isValidPDF) {
      console.error('❌ Invalid PDF buffer - not a valid PDF file!')
      throw new Error('Generated buffer is not a valid PDF file')
    }

    const fileName = `analysis_report_${params.caseId}_${new Date().getTime()}.pdf`
    console.log('📁 Returning PDF with filename:', fileName)

    const response = new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Accept-Ranges': 'bytes'
      }
    })

    console.log('📁 PDF response headers set:', Object.fromEntries(response.headers.entries()))
    return response

  } catch (error) {
    console.error('❌ Report generation failed:', error)

    return NextResponse.json(
      {
        error: 'Report generation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        caseId: params.caseId
      },
      { status: 500 }
    )
  }
}

/**
 * Load analysis data from database
 */
async function loadAnalysisData(caseId: string): Promise<EnhancedAnalysisResult | null> {
  try {
    // First try to load from stored analysis data (new approach)
    const { data: reportData, error: reportError } = await supabaseAdmin
      .from('case_reports')
      .select('analysis_data')
      .eq('case_id', caseId)
      .single()

    if (reportData?.analysis_data) {
      console.log('✅ Loading analysis data from stored report data')

      // Critical: Check for PDF contamination in stored data
      const analysisDataString = JSON.stringify(reportData.analysis_data)
      if (analysisDataString.includes('%PDF')) {
        console.error('❌ CRITICAL: Stored analysis data contains PDF contamination!')
        console.error('❌ Contaminated section:', analysisDataString.slice(analysisDataString.indexOf('%PDF') - 50, analysisDataString.indexOf('%PDF') + 100))
        throw new Error('Stored analysis data contains PDF contamination')
      }

      return {
        caseId,
        ...reportData.analysis_data
      } as EnhancedAnalysisResult
    }

    // Fallback: try to load from ocr_extractions (old approach)
    console.log('📋 Trying fallback: loading from ocr_extractions and case_detections')

    // Load detections (these should still be available)
    const { data: detections, error: detectionsError } = await supabaseAdmin
      .from('case_detections')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })

    if (detectionsError) {
      console.error('Failed to load detections:', detectionsError)
      return null
    }

    // Load OCR extractions (may be empty due to schema issues)
    const { data: extractions, error: extractionsError } = await supabaseAdmin
      .from('ocr_extractions')
      .select('*')
      .eq('case_id', caseId)
      .order('page', { ascending: true })

    if (extractionsError) {
      console.log('OCR extractions not available (expected):', extractionsError.message)
    }

    if (!detections) {
      return null
    }

    // Convert database records back to types
    const parsedLines = (extractions || []).map(ext => ({
      lineId: ext.line_id,
      page: ext.page,
      code: ext.code,
      codeSystem: ext.code_system,
      modifiers: ext.modifiers,
      description: ext.description,
      units: ext.units,
      dos: ext.dos,
      pos: ext.pos,
      revCode: ext.rev_code,
      npi: ext.npi,
      charge: ext.charge_cents,
      allowed: ext.allowed_cents,
      planPaid: ext.plan_paid_cents,
      patientResp: ext.patient_resp_cents,
      bbox: ext.bbox,
      conf: ext.confidence,
      lowConf: ext.low_confidence
    }))

    const parsedDetections = detections.map(det => ({
      ruleKey: det.rule_key,
      severity: det.severity,
      explanation: det.explanation,
      evidence: det.evidence,
      citations: det.citations,
      savingsCents: det.savings_cents
    }))

    // Calculate totals from lines
    const totals = {
      billed: parsedLines.reduce((sum, line) => sum + (line.charge || 0), 0),
      allowed: parsedLines.reduce((sum, line) => sum + (line.allowed || 0), 0),
      planPaid: parsedLines.reduce((sum, line) => sum + (line.planPaid || 0), 0),
      patientResp: parsedLines.reduce((sum, line) => sum + (line.patientResp || 0), 0)
    }

    const savingsTotalCents = parsedDetections.reduce((sum, det) => sum + (det.savingsCents || 0), 0)

    return {
      caseId,
      pricedSummary: {
        header: {}, // Would need to reconstruct from extractions or store separately
        totals,
        lines: parsedLines
      },
      detections: parsedDetections,
      savingsTotalCents,
      // Enhanced fields - these would be undefined for legacy data
      eobSummary: undefined,
      lineMatches: undefined,
      allowedBasisSavingsCents: 0,
      insurancePlan: undefined
    } as EnhancedAnalysisResult

  } catch (error) {
    console.error('Failed to load analysis data:', error)
    return null
  }
}

/**
 * Load existing report draft from database
 */
async function loadExistingReportDraft(caseId: string): Promise<ReportDraft | null> {
  try {
    const { data: reportData, error } = await supabaseAdmin
      .from('case_reports')
      .select('draft')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !reportData?.draft) {
      return null
    }

    return reportData.draft as ReportDraft

  } catch (error) {
    console.error('Failed to load report draft:', error)
    return null
  }
}

/**
 * Save report draft to database
 */
async function saveReportDraft(caseId: string, draft: ReportDraft): Promise<void> {
  const { error } = await supabaseAdmin
    .from('case_reports')
    .upsert({
      case_id: caseId,
      draft,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'case_id'
    })

  if (error) {
    console.error('Failed to save report draft:', error)
    throw new Error('Failed to save report draft')
  }
}

/**
 * Store PDF report in Supabase storage
 */
async function storeReportPdf(caseId: string, pdfBuffer: Buffer): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `reports/${caseId}/analysis_${timestamp}.pdf`

  const { error } = await supabaseAdmin.storage
    .from('wyng_cases')
    .upload(fileName, pdfBuffer, {
      contentType: 'application/pdf',
      cacheControl: '3600'
    })

  if (error) {
    console.error('Failed to upload PDF to Supabase Storage:', error)
    throw new Error(`Failed to store PDF report: ${error.message}`)
  }

  console.log(`📁 PDF stored at: ${fileName}`)
  return fileName
}

/**
 * Save report record to database
 */
async function saveReportRecord(caseId: string, reportPath: string, draft: ReportDraft): Promise<any> {
  const { data, error } = await supabaseAdmin
    .from('case_reports')
    .upsert({
      case_id: caseId,
      report_path: reportPath,
      draft,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'case_id'
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to save report record:', error)
    throw new Error('Failed to save report record')
  }

  return data
}

/**
 * Generate signed URL for report download from Supabase Storage
 */
async function generateSignedUrl(reportPath: string): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from('wyng_cases')
      .createSignedUrl(reportPath, 3600) // 1 hour expiry

    if (error) {
      console.error('Failed to generate signed URL:', error)
      throw new Error(`Failed to generate download URL: ${error.message}`)
    }

    if (!data?.signedUrl) {
      throw new Error('No signed URL returned from Supabase Storage')
    }

    return data.signedUrl

  } catch (error) {
    console.error('Failed to generate signed URL:', error)
    throw new Error('Failed to generate download URL')
  }
}

/**
 * Generate fact-based report draft from analysis data
 */
function generateFactBasedReportDraft(analysisResult: EnhancedAnalysisResult): ReportDraft {
  const { detections, savingsTotalCents, pricedSummary, eobSummary, allowedBasisSavingsCents } = analysisResult

  // Determine savings basis and member impact
  const basis = eobSummary ? 'allowed-basis' : allowedBasisSavingsCents ? 'plan-basis' : 'charge-basis'
  const memberImpact = calculateMemberImpact({
    detections,
    savingsTotalCents,
    basis: eobSummary ? 'allowed' : 'charge',
    lineMatches: [],
    impactedLines: new Set()
  }, eobSummary)

  // Summary with member impact
  const highSeverityCount = detections.filter(d => d.severity === 'high').length

  const summary = `Analysis completed for case ${analysisResult.caseId}. Found ${detections.length} potential billing issues (${highSeverityCount} high-priority) with estimated member savings of $${(savingsTotalCents / 100).toFixed(2)} using ${basis} calculations. ${eobSummary ? `EOB data available for precise allowed-amount analysis. ${memberImpact.impactMessage}` : 'EOB data not available - final savings will be recomputed when EOB is provided.'}`

  // Issues
  const topIssues = detections
    .filter(d => d.severity === 'high')
    .slice(0, 3)
    .map(d => `• ${d.ruleKey.replace(/_/g, ' ')}: ${d.explanation.split('.')[0]}`)
    .join('\n')

  // Next steps
  const nextSteps = [
    '• Review itemized billing details for accuracy',
    '• File formal appeal with insurance using provided letter',
    '• Contact provider billing department using phone script',
    '• Request supporting documentation for questioned charges',
    '• Follow up on appeal status within 30 days',
    '• Track all communications and reference numbers'
  ].join('\n')

  // Fact-based appeal letter
  const provider = pricedSummary.header.providerName || 'the healthcare provider'
  const claimId = pricedSummary.header.claimId || '[Claim ID]'
  const topRules = detections
    .filter(d => d.severity === 'high')
    .slice(0, 3)
    .map(d => d.ruleKey.replace(/_/g, ' '))
    .join(', ')

  const appealLetter = `Dear Claims Review Department,

I am writing to request a formal review of claim ${claimId} for services provided by ${provider}. Our comprehensive analysis has identified several billing discrepancies that require correction.

Specific issues identified include: ${topRules}. These errors appear to result in potential overcharges totaling approximately $${(savingsTotalCents / 100).toFixed(2)}.

We request that you:
1. Conduct a detailed review of all charges against current CMS guidelines
2. Apply appropriate NCCI edits and packaging rules where applicable
3. Verify medical necessity documentation for all services
4. Reprocess the claim with corrections and issue appropriate adjustments

Please provide a detailed explanation of your review findings and any adjustments made. We are available to provide additional documentation as needed to support this review.

Thank you for your prompt attention to this matter.

Sincerely,
[Your Name]
[Date]`

  // Fact-based phone script
  const accountId = pricedSummary.header.accountId || '[Account ID]'
  const specificIssues = detections
    .filter(d => d.evidence?.lineRefs?.length)
    .slice(0, 2)
    .map(d => d.ruleKey.replace(/_/g, ' '))
    .join(' and ')

  const phoneScript = `Hello, I'm calling regarding account ${accountId}. We've reviewed the billing statement and identified potential errors in the charges that need to be addressed.

Specifically, we found issues with ${specificIssues}. Our analysis shows approximately $${(savingsTotalCents / 100).toFixed(2)} in potential billing discrepancies.

Could you please:
1. Review the itemized charges for compliance with current billing guidelines
2. Verify that all procedures were medically necessary and properly documented
3. Check for any duplicate charges or unbundling errors
4. Provide a corrected statement if adjustments are needed

We'd appreciate having this reviewed by your billing compliance team. When can we expect to receive the results of your review?

Thank you for your assistance with resolving these billing issues.`

  // Fact-based checklist
  const checklist = [
    'Complete itemized bill from provider',
    'Explanation of Benefits (EOB) from insurance',
    'Medical records for dates of service',
    'Insurance card and benefit verification'
  ]

  // Add specific items based on detections
  const hasJCodes = detections.some(d => d.ruleKey.includes('jcode'))
  const hasNCCI = detections.some(d => d.ruleKey.includes('ncci') || d.ruleKey.includes('unbundling'))
  const hasTimeUnits = detections.some(d => d.ruleKey.includes('time') || d.ruleKey.includes('unit'))

  if (hasJCodes) {
    checklist.push('Pharmacy invoice for J-code drugs (especially J7999)')
  }
  if (hasNCCI) {
    checklist.push('NCCI edit documentation for procedure codes')
  }
  if (hasTimeUnits) {
    checklist.push('Time logs and procedure documentation')
  }

  checklist.push(
    'Prior authorization documentation (if applicable)',
    'Appeal letter draft for insurance review',
    'Follow-up tracking system for responses'
  )

  return {
    summary,
    issues: topIssues,
    nextSteps,
    appealLetter,
    phoneScript,
    checklist
  }
}