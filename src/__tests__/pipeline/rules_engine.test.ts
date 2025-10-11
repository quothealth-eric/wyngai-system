import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { runDetections } from '@/lib/billing-detection-engine'
import crypto from 'crypto'

describe('18-Rule Billing Detection Engine', () => {
  const testCaseId = crypto.randomUUID()

  // Helper function to create test line
  const createTestLine = (overrides: any = {}) => ({
    id: Math.floor(Math.random() * 1000000),
    case_id: testCaseId,
    artifact_id: crypto.randomUUID(),
    artifact_digest: 'test-digest',
    page: 1,
    row_idx: 1,
    doc_type: 'BILL',
    charge_cents: 10000, // $100
    allowed_cents: 8000, // $80
    plan_paid_cents: 6400, // $64
    patient_resp_cents: 1600, // $16
    dos: new Date('2024-01-15'),
    validators: { row_has_money: true, regex_pass: true },
    low_conf: false,
    vendor_consensus: 1.0,
    conf: 0.95,
    ...overrides
  })

  describe('Rule 1: Duplicate Service Lines', () => {
    it('should detect duplicate services with same code, date, and charge', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          code: '99213',
          code_system: 'CPT',
          description: 'Office visit',
          charge_cents: 15000
        }),
        createTestLine({
          row_idx: 2,
          code: '99213',
          code_system: 'CPT',
          description: 'Office visit',
          charge_cents: 15000
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 30000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const duplicateDetections = detections.filter(d => d.rule_key === 'duplicate_service_lines')

      expect(duplicateDetections.length).toBe(1)
      expect(duplicateDetections[0].severity).toBe('high')
      expect(duplicateDetections[0].evidence.lineRefs).toEqual([0, 1])
    })

    it('should NOT detect duplicates when codes differ', async () => {
      const lines = [
        createTestLine({ row_idx: 1, code: '99213', charge_cents: 15000 }),
        createTestLine({ row_idx: 2, code: '99214', charge_cents: 15000 })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 30000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const duplicateDetections = detections.filter(d => d.rule_key === 'duplicate_service_lines')

      expect(duplicateDetections.length).toBe(0)
    })
  })

  describe('Rule 2: Unbundling (NCCI Violations)', () => {
    it('should detect unbundling when component service lacks appropriate modifier', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          code: '99213',
          code_system: 'CPT',
          description: 'Office visit',
          charge_cents: 15000
        }),
        createTestLine({
          row_idx: 2,
          code: '36415',
          code_system: 'CPT',
          description: 'Venipuncture',
          charge_cents: 2500,
          modifiers: [] // No unbundling modifier
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 17500 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const unbundlingDetections = detections.filter(d => d.rule_key === 'unbundling_ncci_violation')

      expect(unbundlingDetections.length).toBe(1)
      expect(unbundlingDetections[0].severity).toBe('high')
      expect(unbundlingDetections[0].evidence.codes).toContain('99213')
      expect(unbundlingDetections[0].evidence.codes).toContain('36415')
    })

    it('should NOT detect unbundling when modifier 59 is present', async () => {
      const lines = [
        createTestLine({ row_idx: 1, code: '99213', charge_cents: 15000 }),
        createTestLine({
          row_idx: 2,
          code: '36415',
          charge_cents: 2500,
          modifiers: ['59'] // Proper unbundling modifier
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 17500 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const unbundlingDetections = detections.filter(d => d.rule_key === 'unbundling_ncci_violation')

      expect(unbundlingDetections.length).toBe(0)
    })
  })

  describe('Rule 3: Modifier Misuse', () => {
    it('should detect 26 and TC modifiers on same line', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          code: '76700',
          code_system: 'CPT',
          description: 'Ultrasound',
          modifiers: ['26', 'TC'], // Both professional and technical
          charge_cents: 20000
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 20000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const modifierDetections = detections.filter(d => d.rule_key === 'modifier_26_tc_same_line')

      expect(modifierDetections.length).toBe(1)
      expect(modifierDetections[0].severity).toBe('high')
      expect(modifierDetections[0].evidence.modifiers).toContain('26')
      expect(modifierDetections[0].evidence.modifiers).toContain('TC')
    })
  })

  describe('Rule 4: Professional/Technical Split Issues', () => {
    it('should detect double billing for global + professional components', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          code: '76700',
          description: 'Ultrasound - Global',
          charge_cents: 20000
        }),
        createTestLine({
          row_idx: 2,
          code: '76700',
          description: 'Ultrasound - Professional',
          modifiers: ['26'],
          charge_cents: 8000
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 28000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const splitDetections = detections.filter(d => d.rule_key === 'prof_tech_double_billing')

      expect(splitDetections.length).toBe(1)
      expect(splitDetections[0].severity).toBe('high')
    })
  })

  describe('Rule 5: Facility Fee Surprise Billing', () => {
    it('should detect separate facility and professional fees', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          code: '99213',
          description: 'Office visit - Facility',
          pos: '22', // Outpatient hospital
          charge_cents: 15000
        }),
        createTestLine({
          row_idx: 2,
          code: '99213',
          description: 'Office visit - Professional',
          pos: '11', // Office
          charge_cents: 12000
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 27000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const facilityDetections = detections.filter(d => d.rule_key === 'facility_fee_surprise')

      expect(facilityDetections.length).toBe(1)
      expect(facilityDetections[0].severity).toBe('high')
    })
  })

  describe('Rule 7: NSA Emergency Protections', () => {
    it('should detect high patient responsibility for emergency services', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          code: '99281',
          description: 'Emergency department visit',
          pos: '23', // Emergency department
          charge_cents: 100000,
          patient_resp_cents: 60000 // $600 - high for emergency
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 100000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const nsaDetections = detections.filter(d => d.rule_key === 'nsa_emergency_protection')

      expect(nsaDetections.length).toBe(1)
      expect(nsaDetections[0].severity).toBe('high')
    })
  })

  describe('Rule 8: Preventive vs Diagnostic Miscoding', () => {
    it('should detect preventive service with patient cost-sharing', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          code: '99395',
          code_system: 'CPT',
          description: 'Preventive visit, established patient',
          charge_cents: 25000,
          patient_resp_cents: 5000 // Should be $0 for preventive
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 25000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const preventiveDetections = detections.filter(d => d.rule_key === 'preventive_with_cost_share')

      expect(preventiveDetections.length).toBe(1)
      expect(preventiveDetections[0].severity).toBe('warn')
    })
  })

  describe('Rule 10: Drug/Infusion Units Sanity Check', () => {
    it('should detect implausible units for J-codes', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          code: 'J1200',
          code_system: 'HCPCS',
          description: 'Injection, diphenhydramine',
          units: 1500, // Implausibly high
          charge_cents: 75000
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 75000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const unitDetections = detections.filter(d => d.rule_key === 'drug_units_sanity_check')

      expect(unitDetections.length).toBe(1)
      expect(unitDetections[0].severity).toBe('warn')
    })
  })

  describe('Rule 11: Therapy Time Units', () => {
    it('should detect excessive therapy time', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          code: '97110',
          code_system: 'CPT',
          description: 'Therapeutic exercise',
          units: 20, // 300 minutes = 5 hours
          charge_cents: 40000
        }),
        createTestLine({
          row_idx: 2,
          code: '97112',
          code_system: 'CPT',
          description: 'Neuromuscular reeducation',
          units: 15, // 225 minutes
          charge_cents: 30000
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 70000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const therapyDetections = detections.filter(d => d.rule_key === 'therapy_time_excessive')

      expect(therapyDetections.length).toBe(1)
      expect(therapyDetections[0].severity).toBe('warn')
      expect(therapyDetections[0].evidence.totalMinutes).toBe(525) // 35 units * 15 min
    })
  })

  describe('Rule 15: Math Errors', () => {
    it('should detect discrepancy between line items and totals', async () => {
      const lines = [
        createTestLine({ row_idx: 1, charge_cents: 15000 }),
        createTestLine({ row_idx: 2, charge_cents: 12000 })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: {
          billed_cents: 30000 // Line items total 27000, but EOB says 30000
        },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const mathDetections = detections.filter(d => d.rule_key === 'math_error_billed_total')

      expect(mathDetections.length).toBe(1)
      expect(mathDetections[0].severity).toBe('warn')
      expect(mathDetections[0].evidence.calculated).toBe(27000)
      expect(mathDetections[0].evidence.reported).toBe(30000)
    })
  })

  describe('Rule 17: Non-Provider Admin Fees', () => {
    it('should detect administrative fees', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          description: 'Statement processing fee',
          charge_cents: 2500
        }),
        createTestLine({
          row_idx: 2,
          description: 'Administrative fee',
          charge_cents: 1500
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 4000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const adminDetections = detections.filter(d => d.rule_key === 'non_provider_admin_fees')

      expect(adminDetections.length).toBe(1)
      expect(adminDetections[0].severity).toBe('warn')
      expect(adminDetections[0].evidence.descriptions).toContain('Statement processing fee')
    })
  })

  describe('Rule 18: Missing Itemized Bill', () => {
    it('should detect large charges without detailed itemization', async () => {
      const lines = [
        createTestLine({
          row_idx: 1,
          description: 'Hospital services',
          charge_cents: 150000 // $1500 with only one line item
        })
      ]

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: { billed_cents: 150000 },
        lines
      }

      const detections = await runDetections(pricedSummary)
      const itemizedDetections = detections.filter(d => d.rule_key === 'missing_itemized_bill')

      expect(itemizedDetections.length).toBe(1)
      expect(itemizedDetections[0].severity).toBe('info')
      expect(itemizedDetections[0].evidence.lineCount).toBe(1)
    })
  })

  describe('Engine Performance', () => {
    it('should run all rules efficiently on larger dataset', async () => {
      // Create 50 test lines
      const lines = Array.from({ length: 50 }, (_, i) =>
        createTestLine({
          row_idx: i + 1,
          code: `9999${i % 10}`,
          charge_cents: Math.floor(Math.random() * 50000) + 1000
        })
      )

      const pricedSummary = {
        caseId: testCaseId,
        header: {},
        totals: {
          billed_cents: lines.reduce((sum, line) => sum + line.charge_cents, 0)
        },
        lines
      }

      const startTime = Date.now()
      const detections = await runDetections(pricedSummary)
      const endTime = Date.now()

      // Should complete in reasonable time (< 1 second)
      expect(endTime - startTime).toBeLessThan(1000)

      // Should return array of detections
      expect(Array.isArray(detections)).toBe(true)

      console.log(`✅ Processed ${lines.length} lines in ${endTime - startTime}ms, found ${detections.length} detections`)
    })
  })
})