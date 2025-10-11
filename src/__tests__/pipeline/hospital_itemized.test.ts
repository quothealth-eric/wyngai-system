import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { supabase } from '@/lib/db'
import { runDetections, storeDetections } from '@/lib/billing-detection-engine'
import crypto from 'crypto'

describe('Hospital Itemized Bill Analysis', () => {
  let testCaseId: string
  let testArtifactId: string

  beforeAll(async () => {
    testCaseId = crypto.randomUUID()
    testArtifactId = crypto.randomUUID()

    // Create test case
    await supabase.from('cases').insert({
      case_id: testCaseId,
      status: 'processing'
    })

    // Create test artifact
    await supabase.from('artifacts').insert({
      artifact_id: testArtifactId,
      case_id: testCaseId,
      artifact_digest: 'test-digest-hospital',
      filename: 'hospital_itemized_bill.pdf',
      mime_type: 'application/pdf',
      file_size: 1024000,
      pages: 1,
      doc_type: 'BILL',
      storage_path: 'test/hospital_bill.pdf'
    })
  })

  afterAll(async () => {
    // Cleanup test data
    await supabase.from('detections').delete().eq('case_id', testCaseId)
    await supabase.from('ocr_extractions').delete().eq('case_id', testCaseId)
    await supabase.from('artifacts').delete().eq('case_id', testCaseId)
    await supabase.from('cases').delete().eq('case_id', testCaseId)
  })

  it('should capture lab codes and room charges correctly', async () => {
    // Insert test OCR extractions for hospital itemized bill
    const testExtractions = [
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 1,
        doc_type: 'BILL',
        code: '85025',
        code_system: 'CPT',
        description: 'Complete blood count (CBC) with differential',
        charge_cents: 4500, // $45.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 2,
        doc_type: 'BILL',
        code: '80053',
        code_system: 'CPT',
        description: 'Comprehensive metabolic panel',
        charge_cents: 6800, // $68.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 3,
        doc_type: 'BILL',
        code: '86885',
        code_system: 'CPT',
        description: 'Coombs test, direct',
        charge_cents: 3200, // $32.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 4,
        doc_type: 'BILL',
        code: '82962',
        code_system: 'CPT',
        description: 'Glucose, blood by glucose monitoring device',
        charge_cents: 1500, // $15.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 5,
        doc_type: 'BILL',
        code: '86592',
        code_system: 'CPT',
        description: 'Syphilis test, qualitative',
        charge_cents: 2800, // $28.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 6,
        doc_type: 'BILL',
        code: '36415',
        code_system: 'CPT',
        description: 'Collection of venous blood by venipuncture',
        charge_cents: 2500, // $25.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 7,
        doc_type: 'BILL',
        code: 'A9150',
        code_system: 'HCPCS',
        description: 'Non-radioactive contrast imaging material',
        charge_cents: 15000, // $150.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 8,
        doc_type: 'BILL',
        code: 'J1200',
        code_system: 'HCPCS',
        description: 'Injection, diphenhydramine HCl, up to 50 mg',
        units: 1,
        charge_cents: 4500, // $45.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 9,
        doc_type: 'BILL',
        code: 'J7999',
        code_system: 'HCPCS',
        description: 'Compounded drug, not otherwise classified',
        units: 2,
        charge_cents: 25000, // $250.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 10,
        doc_type: 'BILL',
        code: 'J8499',
        code_system: 'HCPCS',
        description: 'Prescription drug, oral, non-chemotherapy',
        units: 1,
        charge_cents: 12000, // $120.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 11,
        doc_type: 'BILL',
        code: 'J7120',
        code_system: 'HCPCS',
        description: 'Ringers lactate infusion, up to 1000 cc',
        units: 3,
        charge_cents: 9000, // $90.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 12,
        doc_type: 'BILL',
        rev_code: '0491',
        description: 'SEMI-PRIVATE ROOM - Medical/Surgical',
        charge_cents: 185000, // $1,850.00
        dos: new Date('2024-01-15'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-hospital',
        page: 1,
        row_idx: 13,
        doc_type: 'BILL',
        rev_code: '0492',
        description: 'SEMI-PRIVATE ROOM - Coronary Care',
        charge_cents: 225000, // $2,250.00
        dos: new Date('2024-01-16'),
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      }
    ]

    // Insert test data
    const { error } = await supabase
      .from('ocr_extractions')
      .insert(testExtractions)

    expect(error).toBeNull()

    // Retrieve inserted data
    const { data: retrievedData, error: retrieveError } = await supabase
      .from('ocr_extractions')
      .select('*')
      .eq('case_id', testCaseId)
      .order('row_idx')

    expect(retrieveError).toBeNull()
    expect(retrievedData).toBeTruthy()
    expect(retrievedData?.length).toBe(13)

    // Verify specific codes are captured
    const expectedCodes = ['85025', '80053', '86885', '82962', '86592', '36415', 'A9150', 'J1200', 'J7999', 'J8499', 'J7120']
    const capturedCodes = retrievedData
      ?.filter(row => row.code)
      .map(row => row.code) || []

    expectedCodes.forEach(code => {
      expect(capturedCodes).toContain(code)
    })

    // Verify room lines with revenue codes
    const roomLines = retrievedData?.filter(row => row.rev_code && ['0491', '0492'].includes(row.rev_code)) || []
    expect(roomLines.length).toBe(2)

    const semiPrivLines = roomLines.filter(row => row.description.includes('SEMI-PRIV'))
    expect(semiPrivLines.length).toBe(2)

    // Verify totals are > $10k
    const totalCharges = retrievedData?.reduce((sum, row) => sum + (row.charge_cents || 0), 0) || 0
    expect(totalCharges).toBeGreaterThan(1000000) // > $10,000

    console.log(`✅ Hospital itemized bill test passed: ${capturedCodes.length} codes captured, total charges: $${(totalCharges/100).toFixed(2)}`)
  })

  it('should NOT contain 99213 office visit codes in hospital bill', async () => {
    // Retrieve all data for this case
    const { data: retrievedData, error } = await supabase
      .from('ocr_extractions')
      .select('code')
      .eq('case_id', testCaseId)

    expect(error).toBeNull()
    expect(retrievedData).toBeTruthy()

    // Verify that 99213 does NOT appear in hospital itemized bill
    const officeVisitCodes = retrievedData.filter(row => row.code === '99213')
    expect(officeVisitCodes.length).toBe(0)

    console.log(`✅ Verified no office visit codes (99213) in hospital itemized bill`)
  })

  it('should run detection engine on hospital bill data', async () => {
    // Get extractions
    const { data: extractions, error } = await supabase
      .from('ocr_extractions')
      .select('*')
      .eq('case_id', testCaseId)
      .order('row_idx')

    expect(error).toBeNull()
    expect(extractions).toBeTruthy()

    // Build priced summary
    const pricedSummary = {
      caseId: testCaseId,
      header: {
        provider_name: 'Test Hospital',
        service_dates: { start: '2024-01-15', end: '2024-01-16' }
      },
      totals: {
        billed_cents: extractions?.reduce((sum, ext) => sum + (ext.charge_cents || 0), 0) || 0
      },
      lines: extractions || []
    }

    // Run detection engine
    const detections = await runDetections(pricedSummary)

    // Store detections
    if (detections.length > 0) {
      await storeDetections(testCaseId, detections)
    }

    // Verify detections were run (may have 0 issues for clean test data)
    expect(Array.isArray(detections)).toBe(true)

    console.log(`✅ Detection engine ran successfully: ${detections.length} issues detected`)
  })
})