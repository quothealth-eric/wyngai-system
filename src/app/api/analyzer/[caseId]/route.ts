import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { runDetections, storeDetections } from '@/lib/billing-detection-engine'

// GET /api/analyzer/:caseId - Retrieve analysis results
export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const caseId = params.caseId

  console.log(`📊 Retrieving analysis for case ${caseId}`)

  try {
    // Verify case exists
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('case_id, status')
      .eq('case_id', caseId)
      .single()

    if (caseError || !caseData) {
      console.error(`❌ Case not found: ${caseId}`)
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      )
    }

    // Get OCR extractions (priced summary)
    const { data: extractions, error: extractionsError } = await supabase
      .from('ocr_extractions')
      .select('*')
      .eq('case_id', caseId)
      .order('page', { ascending: true })
      .order('row_idx', { ascending: true })

    if (extractionsError) {
      console.error(`❌ Failed to fetch extractions:`, extractionsError)
      return NextResponse.json(
        { error: 'Failed to fetch extractions' },
        { status: 500 }
      )
    }

    // Get existing detections
    const { data: detections, error: detectionsError } = await supabase
      .from('detections')
      .select('*')
      .eq('case_id', caseId)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })

    if (detectionsError) {
      console.error(`❌ Failed to fetch detections:`, detectionsError)
      return NextResponse.json(
        { error: 'Failed to fetch detections' },
        { status: 500 }
      )
    }

    // Build priced summary
    const pricedSummary = buildPricedSummary(caseId, extractions || [])

    // Get artifacts info
    const { data: artifacts, error: artifactsError } = await supabase
      .from('artifacts')
      .select('artifact_id, filename, doc_type, pages')
      .eq('case_id', caseId)

    const response = {
      caseId,
      status: caseData.status,
      pricedSummary,
      detections: detections || [],
      artifacts: artifacts || [],
      summary: {
        totalLines: extractions?.length || 0,
        totalDetections: detections?.length || 0,
        highSeverityCount: detections?.filter(d => d.severity === 'high').length || 0,
        totalCharges: pricedSummary.totals.billed_cents || 0
      }
    }

    console.log(`✅ Analysis retrieved for case ${caseId}: ${response.summary.totalLines} lines, ${response.summary.totalDetections} detections`)

    return NextResponse.json(response)

  } catch (error) {
    console.error(`❌ Analysis retrieval error:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/analyzer/:caseId/run - Run analysis on stored extractions
export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const caseId = params.caseId

  console.log(`🔄 Running analysis for case ${caseId}`)

  try {
    // Verify case exists
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('case_id, status')
      .eq('case_id', caseId)
      .single()

    if (caseError || !caseData) {
      console.error(`❌ Case not found: ${caseId}`)
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      )
    }

    // Get OCR extractions
    const { data: extractions, error: extractionsError } = await supabase
      .from('ocr_extractions')
      .select('*')
      .eq('case_id', caseId)
      .order('page', { ascending: true })
      .order('row_idx', { ascending: true })

    if (extractionsError) {
      console.error(`❌ Failed to fetch extractions:`, extractionsError)
      return NextResponse.json(
        { error: 'Failed to fetch extractions' },
        { status: 500 }
      )
    }

    if (!extractions || extractions.length === 0) {
      console.log(`ℹ️ No extractions found for case ${caseId}`)
      return NextResponse.json({
        caseId,
        message: 'No OCR extractions found - upload files first',
        detections: []
      })
    }

    // Build priced summary
    const pricedSummary = buildPricedSummary(caseId, extractions)

    // Run detection engine
    const detections = await runDetections(pricedSummary)

    // Clear existing detections for this case
    await supabase
      .from('detections')
      .delete()
      .eq('case_id', caseId)

    // Store new detections
    if (detections.length > 0) {
      await storeDetections(caseId, detections)
    }

    // Update case status
    await supabase
      .from('cases')
      .update({ status: 'completed' })
      .eq('case_id', caseId)

    const response = {
      caseId,
      message: `Analysis completed: ${detections.length} issues detected`,
      pricedSummary,
      detections,
      summary: {
        totalLines: extractions.length,
        totalDetections: detections.length,
        highSeverityCount: detections.filter(d => d.severity === 'high').length,
        totalCharges: pricedSummary.totals.billed_cents || 0
      }
    }

    console.log(`✅ Analysis completed for case ${caseId}: ${detections.length} detections`)

    return NextResponse.json(response)

  } catch (error) {
    console.error(`❌ Analysis error:`, error)
    return NextResponse.json(
      { error: 'Failed to run analysis', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Helper function to build priced summary from extractions
function buildPricedSummary(caseId: string, extractions: any[]) {
  // Calculate totals
  const totals = {
    billed_cents: extractions.reduce((sum, ext) => sum + (ext.charge_cents || 0), 0),
    allowed_cents: extractions.reduce((sum, ext) => sum + (ext.allowed_cents || 0), 0),
    plan_paid_cents: extractions.reduce((sum, ext) => sum + (ext.plan_paid_cents || 0), 0),
    patient_resp_cents: extractions.reduce((sum, ext) => sum + (ext.patient_resp_cents || 0), 0)
  }

  // Build header from first extraction with keyfacts
  const header = {
    provider_name: extractions.find(e => e.keyfacts?.provider_name)?.keyfacts?.provider_name,
    payer: extractions.find(e => e.keyfacts?.payer)?.keyfacts?.payer,
    claim_id: extractions.find(e => e.keyfacts?.claim_id)?.keyfacts?.claim_id,
    service_dates: {
      start: extractions.reduce((earliest, ext) => {
        if (!ext.dos) return earliest
        return !earliest || ext.dos < earliest ? ext.dos : earliest
      }, null),
      end: extractions.reduce((latest, ext) => {
        if (!ext.dos) return latest
        return !latest || ext.dos > latest ? ext.dos : latest
      }, null)
    }
  }

  return {
    caseId,
    header,
    totals,
    lines: extractions
  }
}