import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/db'

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const caseId = searchParams.get('caseId')

  if (!caseId) {
    return NextResponse.json({ error: 'caseId parameter required' }, { status: 400 })
  }

  try {
    console.log(`🔍 Data Flow Diagnostic for case: ${caseId}`)

    // Step 1: Check case exists and status
    const { data: caseData, error: caseError } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('case_id', caseId)
      .single()

    const step1 = {
      step: 'Case Data',
      success: !caseError && !!caseData,
      error: caseError?.message,
      data: caseData ? {
        caseId: caseData.case_id,
        status: caseData.status,
        createdAt: caseData.created_at,
        updatedAt: caseData.updated_at
      } : null
    }

    // Step 2: Check uploaded files
    const { data: files, error: filesError } = await supabaseAdmin
      .from('case_files')
      .select('*')
      .eq('case_id', caseId)

    const step2 = {
      step: 'Uploaded Files',
      success: !filesError,
      error: filesError?.message,
      data: {
        fileCount: files?.length || 0,
        files: files?.map(f => ({
          id: f.id,
          filename: f.filename,
          mime: f.mime,
          sizeBytes: f.size_bytes,
          storagePath: f.storage_path
        })) || []
      }
    }

    // Step 3: Check OCR extractions (may be empty due to schema changes)
    const { data: extractions, error: extractionsError } = await supabaseAdmin
      .from('ocr_extractions')
      .select('*')
      .eq('case_id', caseId)

    const step3 = {
      step: 'OCR Extractions',
      success: !extractionsError,
      error: extractionsError?.message,
      data: {
        extractionCount: extractions?.length || 0,
        sampleExtraction: extractions?.[0] || null,
        uniqueCodes: extractions ? [...new Set(extractions.map(e => e.code).filter(Boolean))] : []
      }
    }

    // Step 4: Check case detections (18-rule engine output)
    const { data: detections, error: detectionsError } = await supabaseAdmin
      .from('case_detections')
      .select('*')
      .eq('case_id', caseId)

    const step4 = {
      step: 'Analysis Detections',
      success: !detectionsError,
      error: detectionsError?.message,
      data: {
        detectionCount: detections?.length || 0,
        severityBreakdown: detections?.reduce((acc: any, d) => {
          acc[d.severity] = (acc[d.severity] || 0) + 1
          return acc
        }, {}) || {},
        sampleDetection: detections?.[0] || null
      }
    }

    // Step 5: Check stored analysis data (new approach)
    const { data: reportData, error: reportError } = await supabaseAdmin
      .from('case_reports')
      .select('*')
      .eq('case_id', caseId)

    const step5 = {
      step: 'Stored Analysis Data',
      success: !reportError,
      error: reportError?.message,
      data: {
        hasAnalysisData: !!reportData?.[0]?.analysis_data,
        hasDraft: !!reportData?.[0]?.draft,
        reportPath: reportData?.[0]?.report_path,
        createdAt: reportData?.[0]?.created_at,
        analysisDataKeys: reportData?.[0]?.analysis_data ? Object.keys(reportData[0].analysis_data) : [],
        analysisDataSize: reportData?.[0]?.analysis_data ? JSON.stringify(reportData[0].analysis_data).length : 0
      }
    }

    // Step 6: Validate analysis data structure if present
    let step6 = {
      step: 'Analysis Data Validation',
      success: false,
      error: 'No analysis data to validate',
      data: {
        hasPricedSummary: false,
        hasDetections: false,
        hasSavingsTotal: false,
        detectionCount: 0,
        lineCount: 0,
        savingsTotalCents: 0
      }
    }

    if (reportData?.[0]?.analysis_data) {
      const analysisData = reportData[0].analysis_data
      const hasValidStructure =
        analysisData.pricedSummary &&
        analysisData.detections &&
        typeof analysisData.savingsTotalCents === 'number'

      step6 = {
        step: 'Analysis Data Validation',
        success: hasValidStructure,
        error: hasValidStructure ? '' : 'Invalid analysis data structure',
        data: {
          hasPricedSummary: !!analysisData.pricedSummary,
          hasDetections: !!analysisData.detections,
          hasSavingsTotal: typeof analysisData.savingsTotalCents === 'number',
          detectionCount: analysisData.detections?.length || 0,
          lineCount: analysisData.pricedSummary?.lines?.length || 0,
          savingsTotalCents: analysisData.savingsTotalCents
        }
      }
    }

    // Summary
    const summary = {
      overallHealth: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      criticalIssues: [] as string[],
      warnings: [] as string[],
      dataFlowComplete: step1.success && step2.success && step4.success && step5.success && step6.success
    }

    if (!step1.success) summary.criticalIssues.push('Case not found')
    if (!step2.success || (step2.data?.fileCount || 0) === 0) summary.criticalIssues.push('No files uploaded')
    if (!step4.success || (step4.data?.detectionCount || 0) === 0) summary.criticalIssues.push('No analysis detections')
    if (!step5.success) summary.criticalIssues.push('No stored analysis data')
    if (!step6.success) summary.criticalIssues.push('Invalid analysis data structure')

    if ((step3.data?.extractionCount || 0) === 0) summary.warnings.push('No OCR extractions (may use new storage method)')
    if (step5.data?.analysisDataSize && step5.data.analysisDataSize > 100000) summary.warnings.push('Large analysis data size')

    summary.overallHealth = summary.criticalIssues.length > 0 ? 'unhealthy' :
                           summary.warnings.length > 0 ? 'degraded' : 'healthy'

    return NextResponse.json({
      caseId,
      summary,
      steps: [step1, step2, step3, step4, step5, step6],
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Data flow diagnostic failed:', error)
    return NextResponse.json({
      error: 'Data flow diagnostic failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}