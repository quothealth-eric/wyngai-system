import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { OCRService } from '@/lib/ocr-service'
import { BillingRulesEngine, LineItemForAnalysis } from '@/lib/billing-rules-engine'

export async function POST(request: NextRequest) {
  console.log('🔍 ANALYZE API - Starting document analysis')

  try {
    const body = await request.json()
    const { sessionId } = body

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    console.log(`📋 Analyzing documents for session: ${sessionId}`)

    // Get all files for this session
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('*')
      .eq('case_id', sessionId) // Assuming session_id maps to case_id
      .order('created_at', { ascending: true })

    if (filesError) {
      console.error('❌ Failed to fetch files:', filesError)
      return NextResponse.json(
        { error: 'Failed to fetch files for analysis', details: filesError.message },
        { status: 500 }
      )
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files found for this session' },
        { status: 404 }
      )
    }

    console.log(`📄 Found ${files.length} files for analysis`)

    // Initialize OCR service
    const ocrService = new OCRService()

    // Process each file with OCR
    const results = []
    let totalLineItems = 0
    let totalConfidence = 0
    let processedFiles = 0

    for (const file of files) {
      console.log(`🔍 Processing file: ${file.file_name} (ID: ${file.id})`)

      try {
        const result = await ocrService.processDocument(file.id, sessionId)

        results.push({
          fileId: file.id,
          filename: file.file_name,
          success: result.success,
          lineItemsExtracted: result.total_items_extracted,
          confidence: result.confidence_score,
          errorMessage: result.error_message
        })

        if (result.success) {
          totalLineItems += result.total_items_extracted
          totalConfidence += result.confidence_score
          processedFiles++
        }

      } catch (fileError) {
        console.error(`❌ Failed to process file ${file.file_name}:`, fileError)
        results.push({
          fileId: file.id,
          filename: file.file_name,
          success: false,
          lineItemsExtracted: 0,
          confidence: 0,
          errorMessage: fileError instanceof Error ? fileError.message : 'Processing failed'
        })
      }
    }

    // Calculate overall statistics
    const averageConfidence = processedFiles > 0 ? totalConfidence / processedFiles : 0
    const successfulFiles = results.filter(r => r.success).length

    // Run billing rules analysis if we have line items
    let billingAnalysis = null
    if (totalLineItems > 0) {
      console.log(`🔍 Running billing rules analysis on ${totalLineItems} line items`)

      // Get all line items for this session
      const { data: lineItems, error: lineItemsError } = await supabase
        .from('line_items')
        .select('*')
        .eq('session_id', sessionId)

      if (!lineItemsError && lineItems && lineItems.length > 0) {
        // Transform for analysis
        const lineItemsForAnalysis: LineItemForAnalysis[] = lineItems.map(item => ({
          id: item.id,
          line_number: item.line_number || 0,
          cpt_code: item.cpt_code,
          code_description: item.code_description,
          modifier_codes: item.modifier_codes,
          service_date: item.service_date,
          units: item.units,
          charge_amount: item.charge_amount,
          allowed_amount: item.allowed_amount,
          paid_amount: item.paid_amount,
          patient_responsibility: item.patient_responsibility,
          diagnosis_codes: item.diagnosis_codes,
          provider_npi: item.provider_npi
        }))

        // Run analysis
        const rulesEngine = new BillingRulesEngine()
        const violations = await rulesEngine.analyzeLineItems(lineItemsForAnalysis)

        billingAnalysis = {
          totalRulesRun: 18,
          violationsFound: violations.length,
          highSeverityViolations: violations.filter(v => v.severity === 'critical' || v.severity === 'high').length,
          potentialSavings: violations.reduce((sum, v) => sum + (v.potentialSavings || 0), 0),
          violations: violations.map(v => ({
            ruleId: v.ruleId,
            ruleName: v.ruleName,
            severity: v.severity,
            description: v.description,
            details: v.details,
            affectedLineItems: v.affectedLineItems,
            potentialSavings: v.potentialSavings,
            recommendations: v.recommendations
          }))
        }

        console.log(`📊 Billing analysis complete: ${violations.length} violations found`)
      }
    }

    // Update case status
    await supabase
      .from('cases')
      .update({
        status: 'active',
        llm_response: {
          upload_session: true,
          files_count: files.length,
          analysis_completed: true,
          total_line_items: totalLineItems,
          average_confidence: averageConfidence,
          successful_files: successfulFiles,
          billing_analysis: billingAnalysis,
          analysis_timestamp: new Date().toISOString()
        }
      })
      .eq('id', sessionId)

    console.log(`✅ Analysis completed for session ${sessionId}`)
    console.log(`📊 Results: ${successfulFiles}/${files.length} files processed, ${totalLineItems} total line items`)

    // Return comprehensive analysis results
    const response = {
      success: true,
      sessionId,
      summary: {
        totalFiles: files.length,
        successfulFiles,
        failedFiles: files.length - successfulFiles,
        totalLineItems,
        averageConfidence: Math.round(averageConfidence * 100) / 100
      },
      fileResults: results,
      billingAnalysis,
      message: `Analysis completed: ${totalLineItems} line items extracted from ${successfulFiles} files${billingAnalysis ? `, ${billingAnalysis.violationsFound} billing issues found` : ''}`,
      timestamp: new Date().toISOString()
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('❌ Analysis API error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error during analysis',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve analysis results
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session ID is required' },
      { status: 400 }
    )
  }

  try {
    // Get line items for this session
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('line_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('extracted_at', { ascending: true })

    if (lineItemsError) {
      throw lineItemsError
    }

    // Get files information
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('id, file_name, ocr_text, ocr_confidence')
      .eq('case_id', sessionId)

    if (filesError) {
      throw filesError
    }

    // Group line items by file
    const fileResults = files.map(file => {
      const fileLineItems = lineItems.filter(item => item.file_id === file.id)
      return {
        fileId: file.id,
        filename: file.file_name,
        lineItemsCount: fileLineItems.length,
        confidence: file.ocr_confidence,
        lineItems: fileLineItems
      }
    })

    const response = {
      success: true,
      sessionId,
      summary: {
        totalFiles: files.length,
        totalLineItems: lineItems.length,
        averageConfidence: files.length > 0 ? files.reduce((sum, f) => sum + (f.ocr_confidence || 0), 0) / files.length : 0
      },
      fileResults,
      lineItems
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('❌ Failed to retrieve analysis results:', error)
    return NextResponse.json(
      {
        error: 'Failed to retrieve analysis results',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}