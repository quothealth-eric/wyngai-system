/**
 * Knowledge Enhancement System for Healthcare Billing Guidance
 *
 * This module helps enhance responses by accessing publicly available
 * healthcare billing and coding guidelines, common billing issues,
 * and regulatory information.
 */

interface KnowledgeSource {
  type: 'regulatory' | 'billing_patterns' | 'common_issues'
  title: string
  description: string
  data: any
}

// Common billing error patterns based on industry research
const COMMON_BILLING_PATTERNS: KnowledgeSource = {
  type: 'billing_patterns',
  title: 'Common Healthcare Billing Error Patterns',
  description: 'Industry-recognized patterns of billing errors and their solutions',
  data: {
    duplicateCharges: {
      indicators: ['same CPT code multiple times', 'identical amounts on same date'],
      solution: 'Contact provider billing department to remove duplicate charges',
      frequency: 'Found in approximately 30% of medical bills'
    },
    preventiveCareCharges: {
      indicators: ['wellness visit with copay', 'preventive screening charges'],
      solution: 'Under ACA, most preventive care should be 100% covered',
      frequency: 'Common error affecting 15-20% of preventive care claims'
    },
    balanceBilling: {
      indicators: ['out-of-network charges', 'facility fees above insurance payment'],
      solution: 'May violate No Surprises Act - contact insurance and state department',
      frequency: 'Affects millions of patients annually, especially in emergency care'
    },
    bundlingErrors: {
      indicators: ['separate charges for services typically bundled'],
      solution: 'Challenge unbundling - services should be packaged together',
      frequency: 'Found in 10-15% of surgical and procedure bills'
    }
  }
}

// Healthcare regulatory information
const REGULATORY_KNOWLEDGE: KnowledgeSource = {
  type: 'regulatory',
  title: 'Healthcare Billing Regulations and Patient Rights',
  description: 'Key regulations protecting patients from billing errors',
  data: {
    noSurprisesAct: {
      scope: 'Emergency services, out-of-network providers at in-network facilities',
      protection: 'Limits patient responsibility to in-network cost-sharing amounts',
      effectiveDate: 'January 1, 2022',
      applicableStates: 'All 50 states'
    },
    acaPreventiveCare: {
      scope: 'Preventive services with A or B rating from USPSTF',
      protection: 'Must be covered at 100% by insurance with no cost-sharing',
      effectiveDate: 'September 23, 2010',
      commonServices: [
        'Annual wellness visits',
        'Mammograms',
        'Colonoscopies',
        'Blood pressure screenings',
        'Immunizations'
      ]
    },
    erisa: {
      scope: 'Employer-sponsored health plans',
      protection: 'Right to appeal claim denials, access to plan documents',
      appealTimeline: '180 days from denial notice',
      externalReview: 'Available after internal appeals exhausted'
    },
    fairCreditReporting: {
      scope: 'Medical debt reporting',
      protection: 'Medical debt under $500 no longer reported, 365-day waiting period',
      effectiveDate: 'Various dates 2022-2023',
      creditImpact: 'Reduced impact of medical debt on credit scores'
    }
  }
}

// Common healthcare billing issues and resolutions
const COMMON_ISSUES_KNOWLEDGE: KnowledgeSource = {
  type: 'common_issues',
  title: 'Frequently Encountered Billing Issues',
  description: 'Real-world billing problems and evidence-based solutions',
  data: {
    deniedClaims: {
      commonReasons: [
        'Services deemed not medically necessary',
        'Pre-authorization not obtained',
        'Out-of-network provider',
        'Policy exclusions',
        'Coordination of benefits issues'
      ],
      resolutionSteps: [
        'Request detailed denial explanation',
        'Gather supporting medical documentation',
        'File formal appeal within required timeframe',
        'Consider external review if available'
      ],
      successRate: 'Appeals successful in 30-60% of cases when properly documented'
    },
    highCosts: {
      costReductionStrategies: [
        'Request itemized bills',
        'Apply for hospital financial assistance',
        'Negotiate payment plans',
        'Seek charity care programs',
        'Compare prices for non-emergency procedures'
      ],
      financialAssistance: 'Non-profit hospitals required to offer charity care under ACA',
      negotiationTips: 'Many providers accept 10-20% of billed charges for uninsured patients'
    },
    insuranceComplexity: {
      commonConfusions: [
        'Deductible vs. out-of-pocket maximum',
        'In-network vs. out-of-network benefits',
        'EOB interpretation',
        'Prior authorization requirements'
      ],
      resources: [
        'Insurance company customer service',
        'State insurance departments',
        'Healthcare navigators',
        'Patient advocacy organizations'
      ]
    }
  }
}

/**
 * Enhance user guidance by incorporating relevant knowledge sources
 */
export function enhanceGuidanceWithKnowledge(
  userQuestion: string,
  ocrTexts: string[] = [],
  detectedIssues: string[] = []
): {
  relevantPatterns: any[]
  applicableRegulations: any[]
  suggestedResources: any[]
  enhancedGuidance: string[]
} {
  const allText = [userQuestion, ...ocrTexts, ...detectedIssues].join(' ').toLowerCase()

  const relevantPatterns = []
  const applicableRegulations = []
  const suggestedResources = []
  const enhancedGuidance = []

  // Check for billing pattern matches
  const patterns = COMMON_BILLING_PATTERNS.data

  if (allText.includes('duplicate') || allText.includes('same charge')) {
    relevantPatterns.push(patterns.duplicateCharges)
    enhancedGuidance.push('Duplicate charges are found in approximately 30% of medical bills. Contact the provider\'s billing department immediately to request removal of duplicate entries.')
  }

  if (allText.includes('preventive') || allText.includes('wellness') || allText.includes('screening')) {
    relevantPatterns.push(patterns.preventiveCareCharges)
    applicableRegulations.push(REGULATORY_KNOWLEDGE.data.acaPreventiveCare)
    enhancedGuidance.push('Under the Affordable Care Act, most preventive services must be covered at 100% with no cost-sharing when provided by in-network providers.')
  }

  if (allText.includes('out of network') || allText.includes('balance bill') || allText.includes('surprise bill')) {
    relevantPatterns.push(patterns.balanceBilling)
    applicableRegulations.push(REGULATORY_KNOWLEDGE.data.noSurprisesAct)
    enhancedGuidance.push('The No Surprises Act (effective January 1, 2022) protects patients from most surprise bills for emergency care and out-of-network providers at in-network facilities.')
  }

  if (allText.includes('denied') || allText.includes('appeal')) {
    applicableRegulations.push(REGULATORY_KNOWLEDGE.data.erisa)
    suggestedResources.push(COMMON_ISSUES_KNOWLEDGE.data.deniedClaims)
    enhancedGuidance.push('You have the right to appeal claim denials. Appeals are successful in 30-60% of cases when properly documented with medical necessity evidence.')
  }

  if (allText.includes('expensive') || allText.includes('cost') || allText.includes('afford')) {
    suggestedResources.push(COMMON_ISSUES_KNOWLEDGE.data.highCosts)
    enhancedGuidance.push('Non-profit hospitals are required to offer charity care programs under the ACA. Many providers also accept significantly reduced payments for uninsured patients.')
  }

  return {
    relevantPatterns,
    applicableRegulations,
    suggestedResources,
    enhancedGuidance
  }
}

/**
 * Get specific guidance for common billing scenarios
 */
export function getScenarioSpecificGuidance(scenario: string): string[] {
  const guidance = []

  switch (scenario.toLowerCase()) {
    case 'emergency_bill':
      guidance.push(
        'Emergency services are protected under the No Surprises Act',
        'You should only pay in-network cost-sharing amounts',
        'Contact your insurance if charged out-of-network rates',
        'File complaints with state insurance department if needed'
      )
      break

    case 'preventive_care_charge':
      guidance.push(
        'Preventive care should be covered at 100% under ACA',
        'Verify the service was coded as preventive care',
        'Contact insurance to request claim reprocessing',
        'Appeal if insurance incorrectly processed as non-preventive'
      )
      break

    case 'claim_denial':
      guidance.push(
        'Request detailed denial explanation within 24-48 hours',
        'Gather all medical records supporting medical necessity',
        'File internal appeal within 180 days for ERISA plans',
        'Consider external review if internal appeals fail'
      )
      break

    default:
      guidance.push(
        'Request itemized bill to identify specific charges',
        'Compare charges with your insurance EOB',
        'Contact provider billing department for clarification',
        'Consider patient advocacy services if issues persist'
      )
  }

  return guidance
}

/**
 * Generate knowledge-enhanced citations for responses
 */
export function generateKnowledgeBasedCitations(relevantRegulations: any[]): Array<{label: string, reference: string}> {
  const citations: Array<{label: string, reference: string}> = []

  relevantRegulations.forEach(reg => {
    if (reg === REGULATORY_KNOWLEDGE.data.noSurprisesAct) {
      citations.push({
        label: 'No Surprises Act',
        reference: 'H.R.133 - Consolidated Appropriations Act, 2021, Division BB, Title I'
      })
    }

    if (reg === REGULATORY_KNOWLEDGE.data.acaPreventiveCare) {
      citations.push({
        label: 'ACA Preventive Care',
        reference: 'Patient Protection and Affordable Care Act, Section 2713'
      })
    }

    if (reg === REGULATORY_KNOWLEDGE.data.erisa) {
      citations.push({
        label: 'ERISA Appeals',
        reference: 'Employee Retirement Income Security Act, 29 U.S.C. § 1133'
      })
    }
  })

  return citations
}