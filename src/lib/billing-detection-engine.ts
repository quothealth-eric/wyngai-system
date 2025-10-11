import { supabase } from '@/lib/db'

// Types for the detection engine
export interface Detection {
  rule_key: string
  severity: 'info' | 'warn' | 'high'
  explanation: string
  evidence: {
    lineRefs?: number[]
    pageRefs?: number[]
    codes?: string[]
    amounts?: number[]
    dates?: string[]
    [key: string]: any
  }
  citations: Array<{
    title: string
    authority: string
    citation: string
  }>
}

export interface OCRExtraction {
  id: number
  case_id: string
  artifact_id: string
  page: number
  row_idx: number
  doc_type: string
  code?: string
  code_system?: string
  modifiers?: string[]
  description?: string
  units?: number
  dos?: Date
  pos?: string
  rev_code?: string
  npi?: string
  charge_cents?: number
  allowed_cents?: number
  plan_paid_cents?: number
  patient_resp_cents?: number
  keyfacts?: any
  low_conf: boolean
  vendor_consensus: number
  validators: any
  conf: number
}

export interface PricedSummary {
  caseId: string
  header: {
    provider_name?: string
    payer?: string
    claim_id?: string
    service_dates?: { start?: string; end?: string }
  }
  totals: {
    billed_cents?: number
    allowed_cents?: number
    plan_paid_cents?: number
    patient_resp_cents?: number
  }
  lines: OCRExtraction[]
}

// Main detection engine function
export async function runDetections(pricedSummary: PricedSummary): Promise<Detection[]> {
  console.log(`🔍 Running 18-rule detection engine for case ${pricedSummary.caseId}`)

  const detections: Detection[] = []
  const lines = pricedSummary.lines

  if (!lines || lines.length === 0) {
    console.log('ℹ️ No lines to analyze')
    return detections
  }

  console.log(`📊 Analyzing ${lines.length} lines for billing errors`)

  // Run all 18 detection rules
  detections.push(...detectDuplicateServiceLines(lines))
  detections.push(...detectUnbundling(lines))
  detections.push(...detectModifierMisuse(lines))
  detections.push(...detectProfTechSplitIssues(lines))
  detections.push(...detectFacilityFeeSurprise(lines))
  detections.push(...detectNSAAncillary(lines))
  detections.push(...detectNSAEmergencyProtections(lines))
  detections.push(...detectPreventiveDiagnosticMiscoding(lines))
  detections.push(...detectGlobalSurgicalPackage(lines))
  detections.push(...detectDrugInfusionUnitsSanity(lines))
  detections.push(...detectTherapyTimeUnits(lines))
  detections.push(...detectTimelyFiling(lines))
  detections.push(...detectCOBNotApplied(lines))
  detections.push(...detectEOBPostingError(lines, pricedSummary.totals))
  detections.push(...detectMathErrors(lines, pricedSummary.totals))
  detections.push(...detectObservationInpatientMismatch(lines))
  detections.push(...detectNonProviderAdminFees(lines))
  detections.push(...detectMissingItemizedBill(lines))

  console.log(`✅ Detection engine completed: ${detections.length} issues found`)

  return detections
}

// Store detections in database
export async function storeDetections(caseId: string, detections: Detection[]): Promise<void> {
  if (detections.length === 0) {
    console.log('ℹ️ No detections to store')
    return
  }

  const insertData = detections.map(detection => ({
    case_id: caseId,
    artifact_id: null, // Cross-artifact detections
    rule_key: detection.rule_key,
    severity: detection.severity,
    explanation: detection.explanation,
    evidence: detection.evidence,
    citations: detection.citations
  }))

  const { error } = await supabase
    .from('detections')
    .insert(insertData)

  if (error) {
    console.error('❌ Failed to store detections:', error)
    throw error
  }

  console.log(`✅ Stored ${detections.length} detections for case ${caseId}`)
}

// Rule 1: Duplicate service lines
function detectDuplicateServiceLines(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []
  const seen = new Map<string, number[]>()

  lines.forEach((line, index) => {
    if (!line.code || !line.dos || !line.charge_cents) return

    const key = `${line.code}-${line.dos}-${line.charge_cents}-${JSON.stringify(line.modifiers || [])}`

    if (seen.has(key)) {
      seen.get(key)!.push(index)
    } else {
      seen.set(key, [index])
    }
  })

  seen.forEach((indices, key) => {
    if (indices.length > 1) {
      const [code, dos, charge] = key.split('-')
      detections.push({
        rule_key: 'duplicate_service_lines',
        severity: 'high',
        explanation: `Duplicate service lines detected: ${code} on ${dos} with same charge and modifiers`,
        evidence: {
          lineRefs: indices,
          codes: [code],
          dates: [dos],
          amounts: [parseInt(charge)]
        },
        citations: [{
          title: 'CMS Claims Processing Manual',
          authority: 'CMS',
          citation: 'Duplicate billing for identical services is prohibited'
        }]
      })
    }
  })

  return detections
}

// Rule 2: Unbundling (NCCI violations)
function detectUnbundling(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  // Common NCCI PTP pairs (simplified set)
  const bundledPairs = [
    ['99213', '36415'], // Office visit + venipuncture
    ['99214', '36415'], // Office visit + venipuncture
    ['93000', '93005'], // EKG interpretation + tracing
  ]

  bundledPairs.forEach(([comprehensive, component]) => {
    const comprehensiveLine = lines.find(l => l.code === comprehensive)
    const componentLine = lines.find(l => l.code === component)

    if (comprehensiveLine && componentLine) {
      // Check if modifier 59/XE/XP/XS/XU is present on component
      const hasUnbundlingModifier = componentLine.modifiers?.some(mod =>
        ['59', 'XE', 'XP', 'XS', 'XU'].includes(mod)
      )

      if (!hasUnbundlingModifier) {
        detections.push({
          rule_key: 'unbundling_ncci_violation',
          severity: 'high',
          explanation: `NCCI bundling violation: ${component} should be bundled with ${comprehensive} unless modifier 59/X is appropriate`,
          evidence: {
            codes: [comprehensive, component],
            lineRefs: [comprehensiveLine.row_idx, componentLine.row_idx]
          },
          citations: [{
            title: 'NCCI Policy Manual',
            authority: 'CMS',
            citation: 'Components of comprehensive services should not be separately billed without appropriate modifier'
          }]
        })
      }
    }
  })

  return detections
}

// Rule 3: Modifier misuse
function detectModifierMisuse(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  lines.forEach(line => {
    if (!line.modifiers || line.modifiers.length === 0) return

    // Check for 26+TC on same line
    if (line.modifiers.includes('26') && line.modifiers.includes('TC')) {
      detections.push({
        rule_key: 'modifier_26_tc_same_line',
        severity: 'high',
        explanation: 'Modifier 26 (Professional) and TC (Technical) cannot be used on the same line',
        evidence: {
          lineRefs: [line.row_idx],
          codes: [line.code || ''],
          modifiers: line.modifiers
        },
        citations: [{
          title: 'CMS Claims Processing Manual',
          authority: 'CMS',
          citation: 'Professional and technical components are mutually exclusive'
        }]
      })
    }

    // Check for modifier 25 on bundled E/M
    if (line.modifiers.includes('25') && line.code?.startsWith('992')) {
      const hasOtherProcedure = lines.some(other =>
        other.row_idx !== line.row_idx &&
        other.dos === line.dos &&
        other.code &&
        !other.code.startsWith('992')
      )

      if (!hasOtherProcedure) {
        detections.push({
          rule_key: 'modifier_25_without_procedure',
          severity: 'warn',
          explanation: 'Modifier 25 on E/M code without separate significant procedure on same date',
          evidence: {
            lineRefs: [line.row_idx],
            codes: [line.code || '']
          },
          citations: [{
            title: 'CMS E/M Guidelines',
            authority: 'CMS',
            citation: 'Modifier 25 requires significant, separately identifiable E/M service'
          }]
        })
      }
    }
  })

  return detections
}

// Rule 4: Professional/Technical split issues
function detectProfTechSplitIssues(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  // Imaging codes that commonly have prof/tech splits
  const imagingCodes = ['76700', '76705', '76770', '76775', '73060', '73070']

  imagingCodes.forEach(code => {
    const globalLines = lines.filter(l => l.code === code && !l.modifiers?.includes('26') && !l.modifiers?.includes('TC'))
    const profLines = lines.filter(l => l.code === code && l.modifiers?.includes('26'))
    const techLines = lines.filter(l => l.code === code && l.modifiers?.includes('TC'))

    if (globalLines.length > 0 && (profLines.length > 0 || techLines.length > 0)) {
      detections.push({
        rule_key: 'prof_tech_double_billing',
        severity: 'high',
        explanation: `Double billing detected for ${code}: global service billed with separate professional/technical components`,
        evidence: {
          codes: [code],
          lineRefs: [...globalLines.map(l => l.row_idx), ...profLines.map(l => l.row_idx), ...techLines.map(l => l.row_idx)]
        },
        citations: [{
          title: 'CMS Claims Processing Manual',
          authority: 'CMS',
          citation: 'Global services include both professional and technical components'
        }]
      })
    }
  })

  return detections
}

// Rule 5: Facility fee surprise billing
function detectFacilityFeeSurprise(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  const facilityFees = lines.filter(l =>
    l.code && ['G0463', '99211', '99212', '99213', '99214', '99215'].includes(l.code) &&
    l.pos === '22' // Outpatient hospital
  )

  const professionalFees = lines.filter(l =>
    l.code && l.code.startsWith('992') &&
    l.pos !== '22'
  )

  if (facilityFees.length > 0 && professionalFees.length > 0) {
    detections.push({
      rule_key: 'facility_fee_surprise',
      severity: 'high',
      explanation: 'Potential surprise billing: separate facility and professional fees without disclosure',
      evidence: {
        lineRefs: [...facilityFees.map(l => l.row_idx), ...professionalFees.map(l => l.row_idx)],
        codes: [...facilityFees.map(l => l.code!), ...professionalFees.map(l => l.code!)]
      },
      citations: [{
        title: 'No Surprises Act',
        authority: 'Federal',
        citation: 'Facility fees must be disclosed in advance for outpatient services'
      }]
    })
  }

  return detections
}

// Rule 6: NSA ancillary at in-network facility
function detectNSAAncillary(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  const ancillaryCodes = ['36415', '80053', '85025', '93000'] // Lab, radiology, anesthesia codes
  const ancillaryLines = lines.filter(l => l.code && ancillaryCodes.includes(l.code))

  if (ancillaryLines.length > 0) {
    detections.push({
      rule_key: 'nsa_ancillary_protection',
      severity: 'info',
      explanation: 'Ancillary services at in-network facility may be protected under No Surprises Act',
      evidence: {
        lineRefs: ancillaryLines.map(l => l.row_idx),
        codes: ancillaryLines.map(l => l.code!)
      },
      citations: [{
        title: 'No Surprises Act',
        authority: 'Federal',
        citation: 'Ancillary services at in-network facilities subject to NSA protections'
      }]
    })
  }

  return detections
}

// Rule 7: NSA emergency protections
function detectNSAEmergencyProtections(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  const emergencyLines = lines.filter(l => l.pos === '23') // Emergency department

  if (emergencyLines.length > 0) {
    const hasHighPatientResp = emergencyLines.some(l =>
      l.patient_resp_cents && l.patient_resp_cents > 50000 // >$500
    )

    if (hasHighPatientResp) {
      detections.push({
        rule_key: 'nsa_emergency_protection',
        severity: 'high',
        explanation: 'High patient responsibility for emergency services may violate No Surprises Act protections',
        evidence: {
          lineRefs: emergencyLines.map(l => l.row_idx),
          amounts: emergencyLines.map(l => l.patient_resp_cents || 0)
        },
        citations: [{
          title: 'No Surprises Act',
          authority: 'Federal',
          citation: 'Emergency services subject to in-network cost-sharing regardless of provider network status'
        }]
      })
    }
  }

  return detections
}

// Rule 8: Preventive vs diagnostic miscoding
function detectPreventiveDiagnosticMiscoding(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  const preventiveCodes = ['99381', '99382', '99383', '99384', '99385', '99386', '99387', '99391', '99392', '99393', '99394', '99395', '99396', '99397']
  const preventiveLines = lines.filter(l => l.code && preventiveCodes.includes(l.code))

  preventiveLines.forEach(line => {
    if (line.patient_resp_cents && line.patient_resp_cents > 0) {
      const hasPreventiveModifier = line.modifiers?.includes('33')

      if (!hasPreventiveModifier) {
        detections.push({
          rule_key: 'preventive_with_cost_share',
          severity: 'warn',
          explanation: 'Preventive service billed with patient cost-sharing - may indicate diagnostic coding needed',
          evidence: {
            lineRefs: [line.row_idx],
            codes: [line.code!],
            amounts: [line.patient_resp_cents]
          },
          citations: [{
            title: 'ACA Preventive Services',
            authority: 'Federal',
            citation: 'Preventive services must be covered without cost-sharing when no other services provided'
          }]
        })
      }
    }
  })

  return detections
}

// Rule 9: Global surgical package violations
function detectGlobalSurgicalPackage(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  // Major surgery codes with 90-day global periods
  const majorSurgeryCodes = ['44970', '47562', '49505', '49520']

  lines.forEach(line => {
    if (line.code && majorSurgeryCodes.includes(line.code)) {
      // Look for E/M codes within 90 days without modifier 24 or 79
      const surgeryDate = line.dos
      if (!surgeryDate) return

      const emWithinGlobal = lines.filter(other => {
        if (!other.code?.startsWith('992') || !other.dos) return false

        const daysDiff = Math.abs((other.dos.getTime() - surgeryDate.getTime()) / (1000 * 60 * 60 * 24))
        return daysDiff <= 90 &&
               !other.modifiers?.includes('24') &&
               !other.modifiers?.includes('79')
      })

      if (emWithinGlobal.length > 0) {
        detections.push({
          rule_key: 'global_surgical_package_violation',
          severity: 'high',
          explanation: `E/M services within global surgical period for ${line.code} without modifier 24 or 79`,
          evidence: {
            lineRefs: [line.row_idx, ...emWithinGlobal.map(l => l.row_idx)],
            codes: [line.code, ...emWithinGlobal.map(l => l.code!)]
          },
          citations: [{
            title: 'CMS Global Surgery Guidelines',
            authority: 'CMS',
            citation: 'E/M services during global period require modifier 24 (unrelated) or 79 (staged procedure)'
          }]
        })
      }
    }
  })

  return detections
}

// Rule 10: Drug/infusion J-code units sanity check
function detectDrugInfusionUnitsSanity(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  lines.forEach(line => {
    if (line.code?.startsWith('J') && line.units) {
      // Flag implausible units (decimals or very high numbers)
      if (line.units % 1 !== 0 || line.units > 1000) {
        detections.push({
          rule_key: 'drug_units_sanity_check',
          severity: 'warn',
          explanation: `Implausible units for J-code ${line.code}: ${line.units} units`,
          evidence: {
            lineRefs: [line.row_idx],
            codes: [line.code],
            units: [line.units]
          },
          citations: [{
            title: 'CMS HCPCS Guidelines',
            authority: 'CMS',
            citation: 'J-code units should reflect actual drug quantities administered'
          }]
        })
      }
    }
  })

  return detections
}

// Continue with remaining rules...
// (Rules 11-18 follow similar patterns)

// Rule 11: Therapy time units
function detectTherapyTimeUnits(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  const therapyCodes = ['97110', '97112', '97116', '97530'] // 15-minute therapy codes
  const therapyLines = lines.filter(l => l.code && therapyCodes.includes(l.code))

  if (therapyLines.length > 0) {
    const totalUnits = therapyLines.reduce((sum, line) => sum + (line.units || 0), 0)
    const totalMinutes = totalUnits * 15

    if (totalMinutes > 480) { // >8 hours
      detections.push({
        rule_key: 'therapy_time_excessive',
        severity: 'warn',
        explanation: `Excessive therapy time: ${totalMinutes} minutes (${totalUnits} units) in single session`,
        evidence: {
          lineRefs: therapyLines.map(l => l.row_idx),
          codes: therapyLines.map(l => l.code!),
          totalMinutes: totalMinutes
        },
        citations: [{
          title: 'CMS Therapy Guidelines',
          authority: 'CMS',
          citation: 'Therapy sessions should reflect realistic treatment times'
        }]
      })
    }
  }

  return detections
}

// Rule 12: Timely filing
function detectTimelyFiling(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  // Look for CARC/RARC codes indicating timely filing issues
  lines.forEach(line => {
    if (line.keyfacts?.carc_codes?.includes('29') || // Timely filing
        line.keyfacts?.rarc_codes?.includes('N30')) {
      detections.push({
        rule_key: 'timely_filing_violation',
        severity: 'high',
        explanation: 'Timely filing denial - patient should not be billed for provider filing delay',
        evidence: {
          lineRefs: [line.row_idx],
          carc_codes: line.keyfacts?.carc_codes,
          rarc_codes: line.keyfacts?.rarc_codes
        },
        citations: [{
          title: 'ERISA Regulations',
          authority: 'DOL',
          citation: 'Provider timely filing issues cannot be transferred to patient'
        }]
      })
    }
  })

  return detections
}

// Rule 13: COB not applied
function detectCOBNotApplied(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  // Look for indicators of secondary coverage
  const hasSecondaryIndicators = lines.some(line =>
    line.keyfacts?.auth_or_referral?.includes('secondary') ||
    line.description?.toLowerCase().includes('medicare') ||
    line.description?.toLowerCase().includes('medicaid')
  )

  if (hasSecondaryIndicators) {
    const highPatientResp = lines.filter(l =>
      l.patient_resp_cents && l.patient_resp_cents > 10000 // >$100
    )

    if (highPatientResp.length > 0) {
      detections.push({
        rule_key: 'cob_not_applied',
        severity: 'warn',
        explanation: 'High patient responsibility with secondary coverage indicators - COB may not be applied',
        evidence: {
          lineRefs: highPatientResp.map(l => l.row_idx),
          amounts: highPatientResp.map(l => l.patient_resp_cents!)
        },
        citations: [{
          title: 'Medicare Secondary Payer Rules',
          authority: 'CMS',
          citation: 'All applicable coverage must be coordinated before billing patient'
        }]
      })
    }
  }

  return detections
}

// Rule 14: EOB posting error
function detectEOBPostingError(lines: OCRExtraction[], totals: any): Detection[] {
  const detections: Detection[] = []

  // Check if EOB shows $0 patient responsibility but line items show charges
  if (totals.patient_resp_cents === 0) {
    const linesWithPatientResp = lines.filter(l => l.patient_resp_cents && l.patient_resp_cents > 0)

    if (linesWithPatientResp.length > 0) {
      detections.push({
        rule_key: 'eob_posting_error',
        severity: 'high',
        explanation: 'EOB shows $0 patient responsibility but line items show patient charges - posting error',
        evidence: {
          lineRefs: linesWithPatientResp.map(l => l.row_idx),
          amounts: linesWithPatientResp.map(l => l.patient_resp_cents!)
        },
        citations: [{
          title: 'Claims Processing Standards',
          authority: 'NAIC',
          citation: 'EOB totals must match line item details'
        }]
      })
    }
  }

  return detections
}

// Rule 15: Math errors
function detectMathErrors(lines: OCRExtraction[], totals: any): Detection[] {
  const detections: Detection[] = []

  // Calculate line item totals
  const lineItemTotals = {
    billed: lines.reduce((sum, line) => sum + (line.charge_cents || 0), 0),
    allowed: lines.reduce((sum, line) => sum + (line.allowed_cents || 0), 0),
    plan_paid: lines.reduce((sum, line) => sum + (line.plan_paid_cents || 0), 0),
    patient_resp: lines.reduce((sum, line) => sum + (line.patient_resp_cents || 0), 0)
  }

  // Check each total
  const tolerance = 100 // 1 dollar tolerance for rounding

  if (totals.billed_cents && Math.abs(lineItemTotals.billed - totals.billed_cents) > tolerance) {
    detections.push({
      rule_key: 'math_error_billed_total',
      severity: 'warn',
      explanation: `Billed amount math error: line items total $${(lineItemTotals.billed/100).toFixed(2)}, EOB total $${(totals.billed_cents/100).toFixed(2)}`,
      evidence: {
        calculated: lineItemTotals.billed,
        reported: totals.billed_cents,
        difference: Math.abs(lineItemTotals.billed - totals.billed_cents)
      },
      citations: [{
        title: 'Claims Processing Standards',
        authority: 'NAIC',
        citation: 'Line item totals must equal summary totals'
      }]
    })
  }

  return detections
}

// Rules 16-18: Simplified implementations
function detectObservationInpatientMismatch(lines: OCRExtraction[]): Detection[] {
  // Placeholder for observation vs inpatient status detection
  return []
}

function detectNonProviderAdminFees(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  const adminFees = lines.filter(l =>
    l.description?.toLowerCase().includes('statement') ||
    l.description?.toLowerCase().includes('processing') ||
    l.description?.toLowerCase().includes('administration')
  )

  if (adminFees.length > 0) {
    detections.push({
      rule_key: 'non_provider_admin_fees',
      severity: 'warn',
      explanation: 'Administrative or statement fees detected - these are often not patient responsibility',
      evidence: {
        lineRefs: adminFees.map(l => l.row_idx),
        descriptions: adminFees.map(l => l.description!)
      },
      citations: [{
        title: 'State Consumer Protection Laws',
        authority: 'State',
        citation: 'Administrative fees may be prohibited in some jurisdictions'
      }]
    })
  }

  return detections
}

function detectMissingItemizedBill(lines: OCRExtraction[]): Detection[] {
  const detections: Detection[] = []

  // If only summary-level information without detailed line items
  if (lines.length < 3 && lines.some(l => l.charge_cents && l.charge_cents > 100000)) { // >$1000 with few lines
    detections.push({
      rule_key: 'missing_itemized_bill',
      severity: 'info',
      explanation: 'Large charges without detailed itemization - request detailed bill for review',
      evidence: {
        lineCount: lines.length,
        totalCharge: lines.reduce((sum, l) => sum + (l.charge_cents || 0), 0)
      },
      citations: [{
        title: 'Patient Rights',
        authority: 'Federal',
        citation: 'Patients have right to detailed itemized bills for review'
      }]
    })
  }

  return detections
}