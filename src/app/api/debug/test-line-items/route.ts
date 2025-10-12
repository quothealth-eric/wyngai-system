import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { OCRService } from '@/lib/ocr-service'

export async function POST() {
  try {
    console.log('🧪 Testing line items extraction and storage...')

    // Create a test case and file record
    const { data: testCase, error: caseError } = await supabaseAdmin
      .from('cases')
      .insert({
        user_question: 'Test case for line items extraction',
        llm_response: { test: true },
        session_id: 'test-session-' + Date.now()
      })
      .select()
      .single()

    if (caseError) {
      return NextResponse.json({
        success: false,
        message: 'Failed to create test case',
        error: caseError.message
      }, { status: 500 })
    }

    const { data: testFile, error: fileError } = await supabaseAdmin
      .from('files')
      .insert({
        case_id: testCase.id,
        file_name: 'test-medical-bill.png',
        file_type: 'image/png',
        file_size: 1024,
        storage_path: 'test/mock-file.png'
      })
      .select()
      .single()

    if (fileError) {
      return NextResponse.json({
        success: false,
        message: 'Failed to create test file record',
        error: fileError.message
      }, { status: 500 })
    }

    // Create mock line items data
    const mockLineItems = [
      {
        line_number: 1,
        cpt_code: '99213',
        code_description: 'Office or other outpatient visit',
        modifier_codes: null,
        service_date: '2024-01-15',
        place_of_service: '11',
        provider_npi: '1234567890',
        units: 1,
        charge_amount: 150.00,
        allowed_amount: 120.00,
        paid_amount: 96.00,
        patient_responsibility: 24.00,
        deductible_amount: 0.00,
        copay_amount: 20.00,
        coinsurance_amount: 4.00,
        diagnosis_codes: ['Z00.00'],
        authorization_number: null,
        claim_number: 'CLM123456',
        raw_text: 'Line 1: 99213 Office visit $150.00',
        confidence_score: 0.95
      },
      {
        line_number: 2,
        cpt_code: '90471',
        code_description: 'Immunization administration',
        modifier_codes: null,
        service_date: '2024-01-15',
        place_of_service: '11',
        provider_npi: '1234567890',
        units: 1,
        charge_amount: 25.00,
        allowed_amount: 20.00,
        paid_amount: 20.00,
        patient_responsibility: 0.00,
        deductible_amount: 0.00,
        copay_amount: 0.00,
        coinsurance_amount: 0.00,
        diagnosis_codes: ['Z23'],
        authorization_number: null,
        claim_number: 'CLM123456',
        raw_text: 'Line 2: 90471 Vaccination admin $25.00',
        confidence_score: 0.95
      }
    ]

    // Test the OCR service store method
    const ocrService = new OCRService()
    await ocrService['storeLineItems'](mockLineItems, testFile.id, testCase.session_id, testCase.id)

    // Verify the stored data
    const { data: storedItems, error: queryError } = await supabaseAdmin
      .from('line_items')
      .select('*')
      .eq('file_id', testFile.id)
      .order('line_number')

    if (queryError) {
      return NextResponse.json({
        success: false,
        message: 'Failed to query stored line items',
        error: queryError.message
      }, { status: 500 })
    }

    // Clean up test data
    await supabaseAdmin.from('line_items').delete().eq('file_id', testFile.id)
    await supabaseAdmin.from('files').delete().eq('id', testFile.id)
    await supabaseAdmin.from('cases').delete().eq('id', testCase.id)

    return NextResponse.json({
      success: true,
      message: 'Line items extraction and storage test completed successfully',
      test_results: {
        items_created: mockLineItems.length,
        items_stored: storedItems.length,
        sample_stored_item: storedItems[0] || null
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Test error:', error)
    return NextResponse.json({
      success: false,
      message: 'Test failed with unexpected error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Simple health check for line items table
    const { data, error } = await supabaseAdmin
      .from('line_items')
      .select('id, created_at, extraction_method, confidence_score')
      .limit(10)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({
        healthy: false,
        message: 'Line items table is not accessible',
        error: error.message
      })
    }

    return NextResponse.json({
      healthy: true,
      message: 'Line items table is operational',
      recent_items_count: data.length,
      recent_items: data
    })

  } catch (error) {
    return NextResponse.json({
      healthy: false,
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}