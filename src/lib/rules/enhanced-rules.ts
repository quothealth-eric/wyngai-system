/**
 * Enhanced Rule Engine for EOB-Aware Medical Billing Analysis
 * Extends the 18-rule engine with allowed-basis detections
 */

import { PricedSummary, Detection, ParsedLine, EOBSummary, LineMatch, InsurancePlan } from '@/lib/types/ocr'
import { runRuleEngine } from './run18'

/**
 * Enhanced analysis combining charge-basis and allowed-basis detections
 */
export function runEnhancedRuleEngine(
  billSummary: PricedSummary,
  eobSummary?: EOBSummary | null,
  lineMatches?: LineMatch[],
  insurancePlan?: InsurancePlan | null
): Detection[] {
  const detections: Detection[] = []

  // 1. Run existing 18-rule engine for charge-basis detections
  detections.push(...runRuleEngine(billSummary))

  // 2. Add EOB-specific detections if EOB data is available
  if (eobSummary && lineMatches) {
    detections.push(...checkAllowedBasisOvercharges(billSummary, eobSummary, lineMatches))
    detections.push(...checkEOBBillDiscrepancies(billSummary, eobSummary, lineMatches))
    detections.push(...checkUnmatchedBillLines(lineMatches))
    detections.push(...checkPatientResponsibilityErrors(eobSummary, lineMatches))
  }

  // 3. Add insurance plan-specific detections
  if (insurancePlan) {
    detections.push(...checkDeductibleCalculations(billSummary, insurancePlan))
    detections.push(...checkCoinsuranceCalculations(billSummary, insurancePlan))
    detections.push(...checkCopayApplications(billSummary, insurancePlan))
  }

  return detections
}

/**
 * Rule 19: Allowed-Basis Overcharges
 * Detect when bill charges exceed EOB allowed amounts
 */
function checkAllowedBasisOvercharges(
  billSummary: PricedSummary,
  eobSummary: EOBSummary,
  lineMatches: LineMatch[]
): Detection[] {
  const detections: Detection[] = []

  const overchargedMatches = lineMatches.filter(match =>
    match.matchType !== 'unmatched' &&
    match.allowedBasisSavings &&
    match.allowedBasisSavings > 0
  )

  if (overchargedMatches.length > 0) {
    const totalOvercharge = overchargedMatches.reduce((sum, match) =>
      sum + (match.allowedBasisSavings || 0), 0
    )

    detections.push({
      ruleKey: 'allowed_basis_overcharge',
      severity: totalOvercharge > 50000 ? 'high' : totalOvercharge > 10000 ? 'warn' : 'info', // $500+ = high, $100+ = warn
      explanation: `Bill charges exceed EOB allowed amounts by $${(totalOvercharge / 100).toFixed(2)} across ${overchargedMatches.length} line items. This suggests potential overcharging beyond what insurance considers reasonable.`,
      evidence: {
        lineRefs: overchargedMatches.map(m => m.billLineId),
        pageRefs: []
      },
      citations: [{
        title: 'Allowed Amount vs Billed Amount Analysis',
        authority: 'CMS',
        citation: 'When provider bills exceed insurance allowed amounts, patients may be responsible for the difference unless balance billing is prohibited.',
        url: 'https://www.cms.gov/medicare/billing/medicare-billing-quick-reference-guide'
      }],
      savingsCents: totalOvercharge
    })
  }

  return detections
}

/**
 * Rule 20: EOB-Bill Amount Discrepancies
 * Detect mismatches between bill and EOB amounts for the same services
 */
function checkEOBBillDiscrepancies(
  billSummary: PricedSummary,
  eobSummary: EOBSummary,
  lineMatches: LineMatch[]
): Detection[] {
  const detections: Detection[] = []

  for (const match of lineMatches) {
    if (match.matchType === 'unmatched') continue

    const billLine = billSummary.lines.find(l => l.lineId === match.billLineId)
    const eobLine = eobSummary.lines.find(l => l.lineId === match.eobLineId)

    if (!billLine || !eobLine) continue

    // Check for significant discrepancies in billed amounts
    const billAmount = billLine.charge || 0
    const eobBilledAmount = eobLine.billed || 0

    if (billAmount > 0 && eobBilledAmount > 0) {
      const discrepancy = Math.abs(billAmount - eobBilledAmount)
      const discrepancyPercent = discrepancy / Math.max(billAmount, eobBilledAmount)

      if (discrepancy > 1000 && discrepancyPercent > 0.1) { // $10+ and 10%+ difference
        detections.push({
          ruleKey: 'eob_bill_discrepancy',
          severity: discrepancyPercent > 0.5 ? 'high' : 'warn',
          explanation: `Significant discrepancy between bill amount ($${(billAmount / 100).toFixed(2)}) and EOB billed amount ($${(eobBilledAmount / 100).toFixed(2)}) for the same service. Difference: $${(discrepancy / 100).toFixed(2)} (${(discrepancyPercent * 100).toFixed(1)}%).`,
          evidence: {
            lineRefs: [billLine.lineId],
            pageRefs: []
          },
          citations: [{
            title: 'Bill and EOB Reconciliation',
            authority: 'CMS',
            citation: 'Bills and EOBs should reflect the same billed amounts for identical services. Discrepancies may indicate billing errors or processing issues.',
            url: 'https://www.cms.gov/outreach-and-education/medicare-learning-network-mln'
          }],
          savingsCents: discrepancy
        })
      }
    }
  }

  return detections
}

/**
 * Rule 21: Unmatched Bill Lines
 * Detect bill lines that couldn't be matched to EOB entries
 */
function checkUnmatchedBillLines(lineMatches: LineMatch[]): Detection[] {
  const detections: Detection[] = []

  const unmatchedLines = lineMatches.filter(match => match.matchType === 'unmatched')

  if (unmatchedLines.length > 0) {
    const unmatchedAmount = unmatchedLines.reduce((sum, match) => {
      // We can't easily get the bill amount here without the bill data
      // This would need to be enhanced to include bill line data
      return sum + 0 // Placeholder
    }, 0)

    detections.push({
      ruleKey: 'unmatched_bill_lines',
      severity: unmatchedLines.length > 5 ? 'warn' : 'info',
      explanation: `${unmatchedLines.length} bill line items could not be matched to corresponding EOB entries. This may indicate services that were billed but not processed by insurance, or billing for non-covered services.`,
      evidence: {
        lineRefs: unmatchedLines.map(m => m.billLineId),
        pageRefs: []
      },
      citations: [{
        title: 'Unmatched Service Lines Analysis',
        authority: 'CMS',
        citation: 'All billed services should have corresponding EOB entries. Unmatched items may indicate billing errors or non-covered services.',
        url: 'https://www.cms.gov/medicare/appeals-and-grievances'
      }]
    })
  }

  return detections
}

/**
 * Rule 22: Patient Responsibility Calculation Errors
 * Detect errors in patient responsibility calculations based on EOB data
 */
function checkPatientResponsibilityErrors(
  eobSummary: EOBSummary,
  lineMatches: LineMatch[]
): Detection[] {
  const detections: Detection[] = []

  for (const eobLine of eobSummary.lines) {
    if (!eobLine.allowed || !eobLine.planPaid || eobLine.patientResp === undefined) continue

    // Calculate expected patient responsibility
    const expectedPatientResp = eobLine.allowed - eobLine.planPaid
    const actualPatientResp = eobLine.patientResp

    const difference = Math.abs(expectedPatientResp - actualPatientResp)

    if (difference > 500) { // $5+ difference
      detections.push({
        ruleKey: 'patient_responsibility_error',
        severity: difference > 5000 ? 'high' : 'warn', // $50+ = high
        explanation: `Patient responsibility calculation error on EOB. Expected: $${(expectedPatientResp / 100).toFixed(2)}, Actual: $${(actualPatientResp / 100).toFixed(2)}. Difference: $${(difference / 100).toFixed(2)}.`,
        evidence: {
          lineRefs: [],
          pageRefs: []
        },
        citations: [{
          title: 'Patient Responsibility Calculation',
          authority: 'CMS',
          citation: 'Patient responsibility should equal allowed amount minus plan payment, unless other factors like deductibles or copays apply.',
          url: 'https://www.cms.gov/medicare/medicare-basics'
        }],
        savingsCents: difference
      })
    }
  }

  return detections
}

/**
 * Rule 23: Deductible Calculation Verification
 * Verify deductible applications against insurance plan terms
 */
function checkDeductibleCalculations(
  billSummary: PricedSummary,
  insurancePlan: InsurancePlan
): Detection[] {
  const detections: Detection[] = []

  // This is a simplified check - would need more sophisticated logic
  // to track deductible accumulation across multiple claims

  if (insurancePlan.inNetworkDeductible || insurancePlan.outOfNetworkDeductible) {
    // Check if any high-dollar items might be subject to deductible
    const highDollarLines = billSummary.lines.filter(line =>
      (line.charge || 0) > (insurancePlan.inNetworkDeductible || 0)
    )

    if (highDollarLines.length > 0) {
      detections.push({
        ruleKey: 'potential_deductible_issue',
        severity: 'info',
        explanation: `Found ${highDollarLines.length} high-dollar services that may be subject to deductible. Plan deductible: $${((insurancePlan.inNetworkDeductible || 0) / 100).toFixed(2)}. Verify deductible application is correct.`,
        evidence: {
          lineRefs: highDollarLines.map(l => l.lineId),
          pageRefs: []
        },
        citations: [{
          title: 'Deductible Application Rules',
          authority: 'CMS',
          citation: 'Deductibles must be applied correctly according to plan terms and accumulated across the plan year.',
          url: 'https://www.healthcare.gov/glossary/deductible/'
        }]
      })
    }
  }

  return detections
}

/**
 * Rule 24: Coinsurance Calculation Verification
 * Verify coinsurance percentages match plan terms
 */
function checkCoinsuranceCalculations(
  billSummary: PricedSummary,
  insurancePlan: InsurancePlan
): Detection[] {
  const detections: Detection[] = []

  if (insurancePlan.inNetworkCoinsurance || insurancePlan.outOfNetworkCoinsurance) {
    // This would need EOB data to properly verify coinsurance calculations
    // For now, just flag when coinsurance terms are available for review
    detections.push({
      ruleKey: 'coinsurance_review',
      severity: 'info',
      explanation: `Plan has coinsurance terms (In-network: ${insurancePlan.inNetworkCoinsurance || 'N/A'}%, Out-of-network: ${insurancePlan.outOfNetworkCoinsurance || 'N/A'}%). Verify coinsurance calculations are applied correctly based on network status.`,
      evidence: {
        lineRefs: [],
        pageRefs: []
      },
      citations: [{
        title: 'Coinsurance Calculation Guidelines',
        authority: 'CMS',
        citation: 'Coinsurance percentages must be applied correctly based on network participation and plan terms.',
        url: 'https://www.healthcare.gov/glossary/coinsurance/'
      }]
    })
  }

  return detections
}

/**
 * Rule 25: Copay Application Verification
 * Check for proper copay applications based on service types
 */
function checkCopayApplications(
  billSummary: PricedSummary,
  insurancePlan: InsurancePlan
): Detection[] {
  const detections: Detection[] = []

  // Check for services that typically have copays
  const primaryCareServices = billSummary.lines.filter(line =>
    line.code && ['99213', '99214', '99215', '99203', '99204', '99205'].includes(line.code)
  )

  const specialistServices = billSummary.lines.filter(line =>
    line.code && ['99243', '99244', '99245', '99253', '99254', '99255'].includes(line.code)
  )

  if (primaryCareServices.length > 0 && insurancePlan.copayPrimary) {
    detections.push({
      ruleKey: 'primary_care_copay_check',
      severity: 'info',
      explanation: `Found ${primaryCareServices.length} primary care visit(s). Plan copay: $${((insurancePlan.copayPrimary || 0) / 100).toFixed(2)}. Verify copay was applied correctly.`,
      evidence: {
        lineRefs: primaryCareServices.map(l => l.lineId),
        pageRefs: []
      },
      citations: [{
        title: 'Copay Application Rules',
        authority: 'CMS',
        citation: 'Copays must be applied according to plan terms for each covered service type.',
        url: 'https://www.healthcare.gov/glossary/copayment/'
      }]
    })
  }

  if (specialistServices.length > 0 && insurancePlan.copaySpecialist) {
    detections.push({
      ruleKey: 'specialist_copay_check',
      severity: 'info',
      explanation: `Found ${specialistServices.length} specialist visit(s). Plan copay: $${((insurancePlan.copaySpecialist || 0) / 100).toFixed(2)}. Verify copay was applied correctly.`,
      evidence: {
        lineRefs: specialistServices.map(l => l.lineId),
        pageRefs: []
      },
      citations: [{
        title: 'Specialist Copay Guidelines',
        authority: 'CMS',
        citation: 'Specialist visits typically have different copay amounts than primary care visits.',
        url: 'https://www.healthcare.gov/glossary/copayment/'
      }]
    })
  }

  return detections
}