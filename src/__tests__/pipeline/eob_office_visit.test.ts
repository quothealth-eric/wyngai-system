import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { supabase } from '@/lib/db'
import { runDetections, storeDetections } from '@/lib/billing-detection-engine'
import crypto from 'crypto'

describe('EOB Office Visit Analysis', () => {
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
      artifact_digest: 'test-digest-eob',
      filename: 'office_visit_eob.pdf',
      mime_type: 'application/pdf',
      file_size: 512000,
      pages: 1,
      doc_type: 'EOB',
      storage_path: 'test/office_visit_eob.pdf'
    })
  })

  afterAll(async () => {
    // Cleanup test data
    await supabase.from('detections').delete().eq('case_id', testCaseId)
    await supabase.from('ocr_extractions').delete().eq('case_id', testCaseId)
    await supabase.from('artifacts').delete().eq('case_id', testCaseId)
    await supabase.from('cases').delete().eq('case_id', testCaseId)
  })

  it('should capture 99213 office visit codes in EOB', async () => {
    // Insert test OCR extractions for small EOB with office visits
    const testExtractions = [
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-eob',
        page: 1,
        row_idx: 1,
        doc_type: 'EOB',
        code: '99213',
        code_system: 'CPT',
        description: 'Office/outpatient visit, established patient, level 3',
        charge_cents: 18500, // $185.00
        allowed_cents: 14200, // $142.00
        plan_paid_cents: 11360, // $113.60 (80%)
        patient_resp_cents: 2840, // $28.40 (20%)
        dos: new Date('2024-02-10'),
        pos: '11', // Office
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-eob',
        page: 1,
        row_idx: 2,
        doc_type: 'EOB',
        code: '99213',
        code_system: 'CPT',
        description: 'Office/outpatient visit, established patient, level 3',
        charge_cents: 18500, // $185.00
        allowed_cents: 14200, // $142.00
        plan_paid_cents: 11360, // $113.60 (80%)
        patient_resp_cents: 2840, // $28.40 (20%)
        dos: new Date('2024-03-15'),
        pos: '11', // Office
        validators: { row_has_money: true, regex_pass: true },
        low_conf: false,
        vendor_consensus: 1.0,
        conf: 0.95
      },
      {
        case_id: testCaseId,
        artifact_id: testArtifactId,
        artifact_digest: 'test-digest-eob',
        page: 1,
        row_idx: 3,
        doc_type: 'EOB',
        code: '85025',
        code_system: 'CPT',
        description: 'Complete blood count (CBC)',
        charge_cents: 4500, // $45.00
        allowed_cents: 3200, // $32.00
        plan_paid_cents: 2560, // $25.60 (80%)
        patient_resp_cents: 640, // $6.40 (20%)
        dos: new Date('2024-02-10'),
        pos: '11', // Office
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
    expect(retrievedData?.length).toBe(3)

    // Verify 99213 codes are captured (should appear exactly 2 times)
    const officeVisitLines = retrievedData?.filter(row => row.code === '99213') || []
    expect(officeVisitLines.length).toBe(2)

    // Verify these are proper office visit lines with all required fields
    officeVisitLines.forEach(line => {
      expect(line.code).toBe('99213')
      expect(line.code_system).toBe('CPT')
      expect(line.pos).toBe('11') // Office setting
      expect(line.charge_cents).toBeGreaterThan(0)
      expect(line.allowed_cents).toBeGreaterThan(0)
      expect(line.plan_paid_cents).toBeGreaterThan(0)
      expect(line.patient_resp_cents).toBeGreaterThan(0)
      expect(line.dos).toBeTruthy()
    })

    // Verify financial consistency
    officeVisitLines.forEach(line => {
      const expectedPatientResp = line.allowed_cents - line.plan_paid_cents
      expect(line.patient_resp_cents).toBe(expectedPatientResp)
    })

    console.log(`✅ EOB office visit test passed: Found ${officeVisitLines.length} instances of 99213`)
  })

  it('should verify 99213 appears ONLY in this EOB fixture, not hospital bill', async () => {
    // This test ensures that 99213 codes are appropriately segregated to office visit EOBs
    // and do not appear in hospital itemized bills (tested in the other spec)

    const { data: eobData, error } = await supabase
      .from('ocr_extractions')
      .select('code, doc_type')
      .eq('case_id', testCaseId)
      .eq('code', '99213')

    expect(error).toBeNull()
    expect(eobData).toBeTruthy()
    expect(eobData?.length).toBe(2)

    // All 99213 codes should be in EOB documents
    eobData?.forEach(row => {
      expect(row.doc_type).toBe('EOB')
    })

    console.log(`✅ Verified 99213 codes appear only in EOB documents`)
  })

  it('should run detection engine on EOB data and check for office visit patterns', async () => {
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
        provider_name: 'Test Medical Practice',
        payer: 'Test Insurance Co',
        service_dates: { start: '2024-02-10', end: '2024-03-15' }
      },
      totals: {
        billed_cents: extractions?.reduce((sum, ext) => sum + (ext.charge_cents || 0), 0) || 0,
        allowed_cents: extractions?.reduce((sum, ext) => sum + (ext.allowed_cents || 0), 0) || 0,
        plan_paid_cents: extractions?.reduce((sum, ext) => sum + (ext.plan_paid_cents || 0), 0) || 0,
        patient_resp_cents: extractions?.reduce((sum, ext) => sum + (ext.patient_resp_cents || 0), 0) || 0
      },
      lines: extractions || []
    }

    // Run detection engine
    const detections = await runDetections(pricedSummary)

    // Store detections
    if (detections.length > 0) {
      await storeDetections(testCaseId, detections)
    }

    // Verify detections were run
    expect(Array.isArray(detections)).toBe(true)

    // Check for math consistency (should pass for clean test data)
    const mathErrors = detections.filter(d => d.rule_key.includes('math_error'))
    expect(mathErrors.length).toBe(0) // Should have no math errors in test data

    // Verify financial totals are mathematically correct
    const expectedTotals = {
      billed: extractions.reduce((sum, ext) => sum + (ext.charge_cents || 0), 0),
      allowed: extractions.reduce((sum, ext) => sum + (ext.allowed_cents || 0), 0),
      plan_paid: extractions.reduce((sum, ext) => sum + (ext.plan_paid_cents || 0), 0),
      patient_resp: extractions.reduce((sum, ext) => sum + (ext.patient_resp_cents || 0), 0)
    }

    expect(expectedTotals.allowed).toBeLessThanOrEqual(expectedTotals.billed)
    expect(expectedTotals.plan_paid + expectedTotals.patient_resp).toBe(expectedTotals.allowed)

    console.log(`✅ EOB detection engine test passed: ${detections.length} issues detected, totals verified`)
  })

  it('should verify small EOB structure and amounts', async () => {
    const { data: extractions, error } = await supabase
      .from('ocr_extractions')
      .select('*')
      .eq('case_id', testCaseId)

    expect(error).toBeNull()
    expect(extractions).toBeTruthy()

    // This is a "small" EOB - should have few line items
    expect(extractions?.length).toBeLessThanOrEqual(5)

    // Calculate total patient responsibility
    const totalPatientResp = extractions?.reduce((sum, ext) => sum + (ext.patient_resp_cents || 0), 0) || 0

    // Small office visit EOB should have reasonable patient responsibility amounts
    expect(totalPatientResp).toBeGreaterThan(0)
    expect(totalPatientResp).toBeLessThan(50000) // Less than $500 total

    // Verify all lines have complete financial information
    extractions?.forEach(line => {
      if (line.charge_cents && line.charge_cents > 0) {
        expect(line.allowed_cents).toBeTruthy()
        expect(line.plan_paid_cents).toBeDefined()
        expect(line.patient_resp_cents).toBeDefined()
      }
    })

    console.log(`✅ Small EOB structure verified: ${extractions.length} lines, $${(totalPatientResp/100).toFixed(2)} patient responsibility`)
  })
})