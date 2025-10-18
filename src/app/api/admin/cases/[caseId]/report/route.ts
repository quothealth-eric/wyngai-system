import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth, createAdminResponse } from '@/lib/admin/auth'
import { generateNarrativeContent } from '@/lib/prompts/narrative'
import { buildAnalysisReport } from '@/lib/report/buildPdf'
import { AnalysisResult, EnhancedAnalysisResult, FileRef, ReportDraft } from '@/lib/types/ocr'

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

        // Use a simple fallback draft based on analysis data
        reportDraft = {
          summary: `Analysis completed for case ${params.caseId}. Found ${analysisResult.detections.length} potential billing issues with estimated savings of $${(analysisResult.savingsTotalCents / 100).toFixed(2)}.`,
          issues: analysisResult.detections.slice(0, 3).map(d => `• ${d.ruleKey.replace(/_/g, ' ')}: ${d.explanation}`).join('\n'),
          nextSteps: '• Review itemized billing details\n• Contact provider billing department\n• Prepare appeal documentation\n• Follow up on corrections',
          appealLetter: `Dear Claims Department,\n\nI am writing to request a review of billing discrepancies in my recent claim. Our analysis identified potential issues totaling $${(analysisResult.savingsTotalCents / 100).toFixed(2)}.\n\nPlease review and reprocess this claim.\n\nSincerely,\n[Your Name]`,
          phoneScript: `I am calling to discuss potential billing errors in my recent claim. Our analysis shows approximately $${(analysisResult.savingsTotalCents / 100).toFixed(2)} in potential overcharges that need review.`,
          checklist: ['Itemized bill', 'EOB from insurance', 'Medical records', 'Appeal letter', 'Supporting documentation']
        }

        // Save fallback draft
        await saveReportDraft(params.caseId, reportDraft)
        console.log('✅ Fallback narrative saved successfully')
      }
    } else {
      console.log('✅ Using existing report draft from database')
    }

    // 5. Generate PDF report
    console.log('📄 Building PDF report...')
    const pdfBuffer = await buildAnalysisReport(
      analysisResult,
      fileRefs,
      reportDraft,
      {
        includeCoverPage: true,
        includeOriginalImages: true,
        customBranding: {
          companyName: 'Wyng Health Analytics',
          contactInfo: 'support@mywyng.co'
        }
      }
    )

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