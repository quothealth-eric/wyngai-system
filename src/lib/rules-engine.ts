import { ChatCaseInput } from './case-fusion'
import { LineItem } from './image-processor'

export interface Detection {
  id: string
  category: string
  severity: 'low' | 'medium' | 'high'
  explanation: string
  evidence: {
    lineRefs?: string[]
    snippets?: string[]
    pageRefs?: number[]
    amounts?: number[]
  }
  policyCitations: PolicyCitation[]
  mathDelta?: number
  suggestedAction?: string
}

export interface PolicyCitation {
  title: string
  authority: 'Federal' | 'CMS' | 'StateDOI' | 'PayerPolicy'
  citation: string
  applicableText?: string
}

export class RulesEngine {
  static analyzeCase(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    detections.push(...this.checkDuplicateLines(caseInput))
    detections.push(...this.checkNCCIViolations(caseInput))
    detections.push(...this.checkModifierMisuse(caseInput))
    detections.push(...this.checkProfTechSplit(caseInput))
    detections.push(...this.checkFacilityFeeSurprise(caseInput))
    detections.push(...this.checkNSAAncillary(caseInput))
    detections.push(...this.checkNSAEmergency(caseInput))
    detections.push(...this.checkPreventiveMismatch(caseInput))
    detections.push(...this.checkGlobalSurgery(caseInput))
    detections.push(...this.checkDrugUnits(caseInput))
    detections.push(...this.checkTimelyFiling(caseInput))
    detections.push(...this.checkCOBNotApplied(caseInput))
    detections.push(...this.checkMathErrors(caseInput))
    detections.push(...this.checkEOBVsBilling(caseInput))
    detections.push(...this.checkNonProviderFees(caseInput))
    detections.push(...this.checkObservationStatus(caseInput))
    detections.push(...this.checkItemizedBillMissing(caseInput))
    detections.push(...this.checkAmbulanceBalanceBill(caseInput))
    detections.push(...this.checkBenefitsMath(caseInput))

    return detections.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 }
      return severityOrder[b.severity] - severityOrder[a.severity]
    })
  }

  private static checkDuplicateLines(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []
    const seenCombinations = new Map<string, LineItem[]>()

    for (const line of caseInput.extracted.lines) {
      const key = `${line.code || 'unknown'}_${line.dos || 'unknown'}_${line.charge || 0}`

      if (!seenCombinations.has(key)) {
        seenCombinations.set(key, [])
      }
      seenCombinations.get(key)!.push(line)
    }

    for (const entry of Array.from(seenCombinations.entries())) {
      const [key, duplicates] = entry
      if (duplicates.length > 1) {
        const totalCharge = duplicates.reduce((sum: number, line: LineItem) => sum + (line.charge || 0), 0)

        detections.push({
          id: `duplicate_${key}`,
          category: 'Billing Error',
          severity: 'high',
          explanation: `Duplicate charges detected for the same service on the same date. This appears ${duplicates.length} times.`,
          evidence: {
            lineRefs: duplicates.map((d: LineItem) => d.lineId),
            amounts: [totalCharge]
          },
          policyCitations: [
            {
              title: 'Medicare Claims Processing Manual - Duplicate Claim Prevention',
              authority: 'CMS',
              citation: 'CMS_100-04_Ch1_30.3',
              applicableText: 'Duplicate claims are those that are identical in all respects to a previously submitted claim'
            }
          ],
          mathDelta: totalCharge - (duplicates[0].charge || 0),
          suggestedAction: 'Request removal of duplicate charges'
        })
      }
    }

    return detections
  }

  private static checkNCCIViolations(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const commonViolations = [
      { code1: '99213', code2: '99214', issue: 'E/M levels cannot be billed together' },
      { code1: '36415', code2: '85025', issue: 'Venipuncture typically bundled with CBC' },
      { code1: '12001', code2: '12002', issue: 'Simple repair codes of different complexities' }
    ]

    const codes = caseInput.extracted.lines.map(line => line.code).filter(Boolean)

    for (const violation of commonViolations) {
      if (codes.includes(violation.code1) && codes.includes(violation.code2)) {
        detections.push({
          id: `ncci_${violation.code1}_${violation.code2}`,
          category: 'NCCI Violation',
          severity: 'medium',
          explanation: `NCCI bundling violation detected: ${violation.issue}`,
          evidence: {
            lineRefs: caseInput.extracted.lines
              .filter(line => line.code === violation.code1 || line.code === violation.code2)
              .map(line => line.lineId)
          },
          policyCitations: [
            {
              title: 'National Correct Coding Initiative Procedure-to-Procedure Edits',
              authority: 'CMS',
              citation: 'NCCI_PTP_Manual_Current',
              applicableText: 'These procedure codes are not normally reported together'
            }
          ],
          suggestedAction: 'Verify medical necessity for separate billing or request bundled pricing'
        })
      }
    }

    return detections
  }

  private static checkModifierMisuse(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    for (const line of caseInput.extracted.lines) {
      if (line.modifiers) {
        for (const modifier of line.modifiers) {
          let issue = ''

          switch (modifier) {
            case '25':
              if (!line.description?.toLowerCase().includes('evaluation') &&
                  !line.description?.toLowerCase().includes('management')) {
                issue = 'Modifier 25 used without E/M service'
              }
              break
            case '59':
              issue = 'Modifier 59 should only be used when no other modifier applies'
              break
            case '26':
              if (!line.description?.toLowerCase().includes('interpretation') &&
                  !line.description?.toLowerCase().includes('reading')) {
                issue = 'Modifier 26 (professional component) used inappropriately'
              }
              break
            case 'TC':
              if (!line.description?.toLowerCase().includes('technical')) {
                issue = 'Modifier TC (technical component) used inappropriately'
              }
              break
          }

          if (issue) {
            detections.push({
              id: `modifier_${modifier}_${line.lineId}`,
              category: 'Modifier Misuse',
              severity: 'medium',
              explanation: issue,
              evidence: {
                lineRefs: [line.lineId]
              },
              policyCitations: [
                {
                  title: 'CPT Modifier Guidelines',
                  authority: 'CMS',
                  citation: 'CMS_Modifier_Guidelines_Current',
                  applicableText: `Modifier ${modifier} has specific usage requirements`
                }
              ],
              suggestedAction: 'Challenge inappropriate modifier usage'
            })
          }
        }
      }
    }

    return detections
  }

  private static checkProfTechSplit(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const imagingCodes = ['70450', '70460', '70470', '71010', '71020', '72010', '72020']
    const profComponents = caseInput.extracted.lines.filter(line =>
      line.modifiers?.includes('26')
    )
    const techComponents = caseInput.extracted.lines.filter(line =>
      line.modifiers?.includes('TC')
    )

    if (profComponents.length > 0 && techComponents.length === 0) {
      detections.push({
        id: 'prof_component_only',
        category: 'Component Billing',
        severity: 'medium',
        explanation: 'Professional component billed without corresponding technical component',
        evidence: {
          lineRefs: profComponents.map(line => line.lineId)
        },
        policyCitations: [
          {
            title: 'Medicare Claims Processing Manual - Component Billing',
            authority: 'CMS',
            citation: 'CMS_100-04_Ch13_40',
            applicableText: 'Professional and technical components should be properly paired'
          }
        ],
        suggestedAction: 'Verify if global service was intended or technical component was missed'
      })
    }

    return detections
  }

  private static checkFacilityFeeSurprise(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const facilityFeeLines = caseInput.extracted.lines.filter(line =>
      line.description?.toLowerCase().includes('facility fee') ||
      line.description?.toLowerCase().includes('hospital outpatient')
    )

    if (facilityFeeLines.length > 0) {
      detections.push({
        id: 'facility_fee_surprise',
        category: 'Surprise Billing',
        severity: 'high',
        explanation: 'Facility fee charged at hospital-owned clinic. This may be a surprise billing violation if patient was not properly notified.',
        evidence: {
          lineRefs: facilityFeeLines.map(line => line.lineId)
        },
        policyCitations: [
          {
            title: 'Hospital Outpatient Prospective Payment System - Facility Fees',
            authority: 'CMS',
            citation: 'CMS_OPPS_Facility_Fee_Requirements',
            applicableText: 'Hospitals must provide notice of facility fees for outpatient services'
          },
          {
            title: 'No Surprises Act - Provider Disclosure Requirements',
            authority: 'Federal',
            citation: 'NSA_Section_2799A-5',
            applicableText: 'Providers must give good faith estimates including facility fees'
          }
        ],
        suggestedAction: 'Check if proper notice was provided before service'
      })
    }

    return detections
  }

  private static checkNSAAncillary(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const ancillaryServices = ['anesthesia', 'pathology', 'radiology', 'lab', 'assistant surgeon']
    const hasAncillary = caseInput.extracted.lines.some(line =>
      ancillaryServices.some(service =>
        line.description?.toLowerCase().includes(service)
      )
    )

    const hasInNetworkFacility = caseInput.narrative.text.toLowerCase().includes('in-network') ||
                                caseInput.narrative.text.toLowerCase().includes('network hospital')

    if (hasAncillary && hasInNetworkFacility) {
      detections.push({
        id: 'nsa_ancillary_violation',
        category: 'No Surprises Act Violation',
        severity: 'high',
        explanation: 'Out-of-network ancillary services at in-network facility may violate No Surprises Act protections.',
        evidence: {
          lineRefs: caseInput.extracted.lines
            .filter(line => ancillaryServices.some(service =>
              line.description?.toLowerCase().includes(service)
            ))
            .map(line => line.lineId)
        },
        policyCitations: [
          {
            title: 'No Surprises Act - Ancillary Services Protection',
            authority: 'Federal',
            citation: 'NSA_Section_2799A-1(b)',
            applicableText: 'Patients are protected from surprise bills for ancillary services at in-network facilities'
          }
        ],
        suggestedAction: 'Request reprocessing as in-network under No Surprises Act'
      })
    }

    return detections
  }

  private static checkNSAEmergency(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const emergencyKeywords = ['emergency', 'er ', 'emergency room', 'urgent', 'trauma']
    const hasEmergency = emergencyKeywords.some(keyword =>
      caseInput.narrative.text.toLowerCase().includes(keyword) ||
      caseInput.extracted.lines.some(line =>
        line.description?.toLowerCase().includes(keyword)
      )
    )

    if (hasEmergency) {
      detections.push({
        id: 'nsa_emergency_protection',
        category: 'No Surprises Act Protection',
        severity: 'high',
        explanation: 'Emergency services are protected under the No Surprises Act regardless of network status.',
        evidence: {
          snippets: emergencyKeywords.filter(keyword =>
            caseInput.narrative.text.toLowerCase().includes(keyword)
          )
        },
        policyCitations: [
          {
            title: 'No Surprises Act - Emergency Services',
            authority: 'Federal',
            citation: 'NSA_Section_2799A-1(a)',
            applicableText: 'Emergency services must be covered without prior authorization and without out-of-network cost sharing'
          }
        ],
        suggestedAction: 'Ensure emergency services are billed at in-network rates'
      })
    }

    return detections
  }

  private static checkPreventiveMismatch(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const preventiveKeywords = ['preventive', 'screening', 'wellness', 'annual physical', 'mammogram', 'colonoscopy']
    const hasPreventiveService = preventiveKeywords.some(keyword =>
      caseInput.narrative.text.toLowerCase().includes(keyword) ||
      caseInput.extracted.lines.some(line =>
        line.description?.toLowerCase().includes(keyword)
      )
    )

    const hasCharges = caseInput.extracted.totals.patientResp && caseInput.extracted.totals.patientResp > 0

    if (hasPreventiveService && hasCharges) {
      detections.push({
        id: 'preventive_charged',
        category: 'ACA Violation',
        severity: 'high',
        explanation: 'Preventive services should be covered at 100% for in-network providers under the Affordable Care Act.',
        evidence: {
          amounts: [caseInput.extracted.totals.patientResp || 0]
        },
        policyCitations: [
          {
            title: 'Affordable Care Act - Preventive Services Coverage',
            authority: 'Federal',
            citation: 'ACA_Section_2713',
            applicableText: 'Preventive services must be covered without cost sharing when provided by in-network providers'
          }
        ],
        suggestedAction: 'Appeal charges for preventive services'
      })
    }

    return detections
  }

  private static checkGlobalSurgery(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const surgeryKeywords = ['surgery', 'procedure', 'operation']
    const followUpKeywords = ['follow-up', 'post-op', 'post-operative', 'wound check']

    const hasSurgery = surgeryKeywords.some(keyword =>
      caseInput.extracted.lines.some(line =>
        line.description?.toLowerCase().includes(keyword)
      )
    )

    const hasFollowUp = followUpKeywords.some(keyword =>
      caseInput.extracted.lines.some(line =>
        line.description?.toLowerCase().includes(keyword)
      )
    )

    if (hasSurgery && hasFollowUp) {
      detections.push({
        id: 'global_surgery_violation',
        category: 'Global Surgery Period',
        severity: 'medium',
        explanation: 'Follow-up care may be included in global surgery package and should not be separately billed.',
        evidence: {
          lineRefs: caseInput.extracted.lines
            .filter(line => followUpKeywords.some(keyword =>
              line.description?.toLowerCase().includes(keyword)
            ))
            .map(line => line.lineId)
        },
        policyCitations: [
          {
            title: 'Medicare Global Surgery Policy',
            authority: 'CMS',
            citation: 'CMS_Global_Surgery_Policy',
            applicableText: 'Post-operative care is included in the global surgery payment'
          }
        ],
        suggestedAction: 'Challenge separate billing for routine post-operative care'
      })
    }

    return detections
  }

  private static checkDrugUnits(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const jCodeLines = caseInput.extracted.lines.filter(line =>
      line.code?.startsWith('J') && line.units
    )

    for (const line of jCodeLines) {
      if (line.units && line.units > 100) {
        detections.push({
          id: `drug_units_${line.lineId}`,
          category: 'Drug Units Verification',
          severity: 'medium',
          explanation: `Unusually high drug units (${line.units}) detected for J-code ${line.code}. Verify dosage is correct.`,
          evidence: {
            lineRefs: [line.lineId],
            amounts: [line.units]
          },
          policyCitations: [
            {
              title: 'Medicare Drug Pricing Policy',
              authority: 'CMS',
              citation: 'CMS_Drug_Pricing_Guidelines',
              applicableText: 'Drug units must accurately reflect actual dosage administered'
            }
          ],
          suggestedAction: 'Verify drug dosage with medical records'
        })
      }
    }

    return detections
  }

  private static checkTimelyFiling(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const timelyFilingKeywords = ['timely filing', 'late submission', 'filing deadline']
    const hasTimelyFilingIssue = timelyFilingKeywords.some(keyword =>
      caseInput.narrative.text.toLowerCase().includes(keyword) ||
      caseInput.extracted.remarks.denialText?.some(text =>
        text.toLowerCase().includes(keyword)
      )
    )

    if (hasTimelyFilingIssue) {
      detections.push({
        id: 'timely_filing_violation',
        category: 'Timely Filing',
        severity: 'high',
        explanation: 'Provider failed to submit claim within timely filing deadline. This should be written off, not billed to patient.',
        evidence: {
          snippets: caseInput.extracted.remarks.denialText?.filter(text =>
            timelyFilingKeywords.some(keyword => text.toLowerCase().includes(keyword))
          ) || []
        },
        policyCitations: [
          {
            title: 'Timely Filing Requirements',
            authority: 'StateDOI',
            citation: 'State_Timely_Filing_Regulations',
            applicableText: 'Provider administrative failures cannot be billed to patients'
          }
        ],
        suggestedAction: 'Request write-off due to provider timely filing failure'
      })
    }

    return detections
  }

  private static checkCOBNotApplied(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const hasSecondaryInsurance = caseInput.benefits?.secondaryCoverage ||
      caseInput.narrative.text.toLowerCase().includes('secondary insurance') ||
      caseInput.narrative.text.toLowerCase().includes('two insurance')

    if (hasSecondaryInsurance && caseInput.extracted.totals.patientResp && caseInput.extracted.totals.patientResp > 0) {
      detections.push({
        id: 'cob_not_applied',
        category: 'Coordination of Benefits',
        severity: 'medium',
        explanation: 'Secondary insurance may not have been properly applied to reduce patient responsibility.',
        evidence: {
          amounts: [caseInput.extracted.totals.patientResp]
        },
        policyCitations: [
          {
            title: 'Coordination of Benefits Requirements',
            authority: 'Federal',
            citation: 'ERISA_COB_Requirements',
            applicableText: 'All applicable insurance coverage must be coordinated to minimize patient cost'
          }
        ],
        suggestedAction: 'Submit to secondary insurance for coordination of benefits'
      })
    }

    return detections
  }

  private static checkMathErrors(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const lines = caseInput.extracted.lines
    const totals = caseInput.extracted.totals

    const calculatedTotalCharges = lines.reduce((sum, line) => sum + (line.charge || 0), 0)
    const calculatedTotalAllowed = lines.reduce((sum, line) => sum + (line.allowed || 0), 0)
    const calculatedPatientResp = lines.reduce((sum, line) => sum + (line.patientResp || 0), 0)

    if (totals.billed && Math.abs(calculatedTotalCharges - totals.billed) > 1) {
      detections.push({
        id: 'math_error_charges',
        category: 'Math Error',
        severity: 'high',
        explanation: 'Total charges do not match sum of line items.',
        evidence: {
          amounts: [totals.billed, calculatedTotalCharges]
        },
        policyCitations: [
          {
            title: 'Billing Accuracy Requirements',
            authority: 'Federal',
            citation: 'HIPAA_Billing_Standards',
            applicableText: 'Medical bills must be mathematically accurate'
          }
        ],
        mathDelta: Math.abs(calculatedTotalCharges - totals.billed),
        suggestedAction: 'Request corrected bill with accurate totals'
      })
    }

    if (totals.patientResp && Math.abs(calculatedPatientResp - totals.patientResp) > 1) {
      detections.push({
        id: 'math_error_patient_resp',
        category: 'Math Error',
        severity: 'high',
        explanation: 'Patient responsibility total does not match sum of line items.',
        evidence: {
          amounts: [totals.patientResp, calculatedPatientResp]
        },
        policyCitations: [
          {
            title: 'Billing Accuracy Requirements',
            authority: 'Federal',
            citation: 'HIPAA_Billing_Standards',
            applicableText: 'Patient responsibility must be accurately calculated'
          }
        ],
        mathDelta: Math.abs(calculatedPatientResp - totals.patientResp),
        suggestedAction: 'Challenge incorrect patient responsibility calculation'
      })
    }

    return detections
  }

  private static checkEOBVsBilling(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    if (caseInput.images.length >= 2) {
      const hasEOB = caseInput.extracted.remarks.carcRarc && caseInput.extracted.remarks.carcRarc.length > 0
      const hasBilling = caseInput.extracted.totals.patientResp

      if (hasEOB && hasBilling) {
        detections.push({
          id: 'eob_bill_comparison_needed',
          category: 'Document Verification',
          severity: 'medium',
          explanation: 'Compare EOB and bill amounts for discrepancies.',
          evidence: {
            amounts: [caseInput.extracted.totals.patientResp || 0]
          },
          policyCitations: [
            {
              title: 'Patient Bill Accuracy Standards',
              authority: 'Federal',
              citation: 'HIPAA_Patient_Rights',
              applicableText: 'Patients have the right to accurate billing that matches insurance processing'
            }
          ],
          suggestedAction: 'Verify bill matches EOB processing'
        })
      }
    }

    return detections
  }

  private static checkNonProviderFees(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const nonProviderFees = ['statement fee', 'administrative fee', 'card processing fee', 'billing fee']
    const hasNonProviderFees = caseInput.extracted.lines.some(line =>
      nonProviderFees.some(fee =>
        line.description?.toLowerCase().includes(fee)
      )
    )

    if (hasNonProviderFees) {
      detections.push({
        id: 'non_provider_fees',
        category: 'Invalid Fees',
        severity: 'medium',
        explanation: 'Administrative or processing fees may not be legitimate medical charges.',
        evidence: {
          lineRefs: caseInput.extracted.lines
            .filter(line => nonProviderFees.some(fee =>
              line.description?.toLowerCase().includes(fee)
            ))
            .map(line => line.lineId)
        },
        policyCitations: [
          {
            title: 'Medical Billing Standards',
            authority: 'Federal',
            citation: 'Medical_Billing_Standards',
            applicableText: 'Only legitimate medical services should be billed to patients'
          }
        ],
        suggestedAction: 'Challenge non-medical administrative fees'
      })
    }

    return detections
  }

  private static checkObservationStatus(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const observationKeywords = ['observation', 'obs status', 'outpatient status']
    const inpatientKeywords = ['inpatient', 'admitted', 'hospital stay']

    const hasObservation = observationKeywords.some(keyword =>
      caseInput.narrative.text.toLowerCase().includes(keyword)
    )

    const hasInpatient = inpatientKeywords.some(keyword =>
      caseInput.narrative.text.toLowerCase().includes(keyword)
    )

    if (hasObservation && hasInpatient) {
      detections.push({
        id: 'observation_status_mismatch',
        category: 'Status Verification',
        severity: 'medium',
        explanation: 'Observation vs inpatient status affects coverage and costs. Verify correct status was used.',
        evidence: {
          snippets: [caseInput.narrative.text.substring(0, 200)]
        },
        policyCitations: [
          {
            title: 'Medicare Observation vs Inpatient Guidelines',
            authority: 'CMS',
            citation: 'CMS_Observation_Guidelines',
            applicableText: 'Patient status determines coverage and benefit application'
          }
        ],
        suggestedAction: 'Verify patient status determination was appropriate'
      })
    }

    return detections
  }

  private static checkItemizedBillMissing(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const hasMinimalLineItems = caseInput.extracted.lines.length < 3
    const hasSummaryLanguage = caseInput.narrative.text.toLowerCase().includes('summary') ||
                              caseInput.narrative.text.toLowerCase().includes('no detail')

    if (hasMinimalLineItems || hasSummaryLanguage) {
      detections.push({
        id: 'itemized_bill_missing',
        category: 'Documentation Required',
        severity: 'low',
        explanation: 'Detailed itemized bill may be needed for proper analysis and verification.',
        evidence: {
          snippets: ['Limited line item detail available']
        },
        policyCitations: [
          {
            title: 'Patient Right to Itemized Bill',
            authority: 'Federal',
            citation: 'Patient_Bill_Rights',
            applicableText: 'Patients have the right to receive detailed itemized bills'
          }
        ],
        suggestedAction: 'Request detailed itemized bill from provider'
      })
    }

    return detections
  }

  private static checkAmbulanceBalanceBill(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    const ambulanceKeywords = ['ambulance', 'emergency transport', 'emt', 'paramedic']
    const hasAmbulance = ambulanceKeywords.some(keyword =>
      caseInput.narrative.text.toLowerCase().includes(keyword) ||
      caseInput.extracted.lines.some(line =>
        line.description?.toLowerCase().includes(keyword)
      )
    )

    if (hasAmbulance) {
      detections.push({
        id: 'ambulance_balance_bill',
        category: 'State Regulations',
        severity: 'medium',
        explanation: 'Ground ambulance balance billing rules vary by state. Check state-specific protections.',
        evidence: {
          lineRefs: caseInput.extracted.lines
            .filter(line => ambulanceKeywords.some(keyword =>
              line.description?.toLowerCase().includes(keyword)
            ))
            .map(line => line.lineId)
        },
        policyCitations: [
          {
            title: 'State Ground Ambulance Regulations',
            authority: 'StateDOI',
            citation: 'State_Ambulance_Balance_Bill_Rules',
            applicableText: 'Ground ambulance balance billing rules vary by state jurisdiction'
          }
        ],
        suggestedAction: 'Check state-specific ground ambulance protection laws'
      })
    }

    return detections
  }

  private static checkBenefitsMath(caseInput: ChatCaseInput): Detection[] {
    const detections: Detection[] = []

    if (!caseInput.benefits || !caseInput.extracted.totals.billed) {
      return detections
    }

    const benefits = caseInput.benefits
    const totals = caseInput.extracted.totals
    const billedAmount = totals.billed || 0
    const actualPatientResp = totals.patientResp || 0

    let expectedPatientResp = 0

    if (benefits.deductible) {
      const deductibleOwed = Math.min(billedAmount, benefits.deductible.individual || 0)
      const deductibleMet = benefits.deductible.met || 0
      const remainingDeductible = Math.max(0, (benefits.deductible.individual || 0) - deductibleMet)
      const deductibleToApply = Math.min(billedAmount, remainingDeductible)

      expectedPatientResp += deductibleToApply

      const amountAfterDeductible = billedAmount - deductibleToApply

      if (amountAfterDeductible > 0 && benefits.coinsurance) {
        expectedPatientResp += amountAfterDeductible * (benefits.coinsurance / 100)
      }
    }

    if (Math.abs(actualPatientResp - expectedPatientResp) > 25) {
      detections.push({
        id: 'benefits_math_error',
        category: 'Benefits Calculation Error',
        severity: 'high',
        explanation: `Patient responsibility appears incorrect. Expected ~$${expectedPatientResp.toFixed(2)} but bill shows $${actualPatientResp.toFixed(2)}.`,
        evidence: {
          amounts: [actualPatientResp, expectedPatientResp]
        },
        policyCitations: [
          {
            title: 'Insurance Benefit Calculation Standards',
            authority: 'Federal',
            citation: 'ERISA_Benefit_Calculation_Standards',
            applicableText: 'Insurance benefits must be calculated accurately according to plan terms'
          }
        ],
        mathDelta: Math.abs(actualPatientResp - expectedPatientResp),
        suggestedAction: 'Contact insurance company to verify benefit calculation'
      })
    }

    return detections
  }
}