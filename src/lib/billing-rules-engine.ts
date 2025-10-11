export interface BillingRule {
  id: string
  name: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  category: 'coding' | 'billing' | 'compliance' | 'documentation'
}

export interface RuleViolation {
  ruleId: string
  ruleName: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  details: string
  affectedLineItems: number[]
  potentialSavings?: number
  evidence: string[]
  recommendations: string[]
}

export interface LineItemForAnalysis {
  id: number
  line_number: number
  cpt_code: string | null
  code_description: string | null
  modifier_codes: string[] | null
  service_date: string | null
  units: number | null
  charge_amount: number | null
  allowed_amount: number | null
  paid_amount: number | null
  patient_responsibility: number | null
  diagnosis_codes: string[] | null
  provider_npi: string | null
}

export class BillingRulesEngine {

  private rules: BillingRule[] = [
    {
      id: 'RULE_001',
      name: 'Duplicate Service Codes',
      description: 'Identifies duplicate CPT codes on the same date',
      severity: 'high',
      category: 'billing'
    },
    {
      id: 'RULE_002',
      name: 'Unbundling Violations',
      description: 'Detects services that should be bundled but are billed separately',
      severity: 'critical',
      category: 'coding'
    },
    {
      id: 'RULE_003',
      name: 'Upcoding Detection',
      description: 'Identifies potential upcoding to higher-reimbursement codes',
      severity: 'critical',
      category: 'coding'
    },
    {
      id: 'RULE_004',
      name: 'Modifier Abuse',
      description: 'Detects inappropriate use of modifiers',
      severity: 'high',
      category: 'coding'
    },
    {
      id: 'RULE_005',
      name: 'Units Validation',
      description: 'Validates appropriate units for services',
      severity: 'medium',
      category: 'billing'
    },
    {
      id: 'RULE_006',
      name: 'Excessive Charges',
      description: 'Identifies charges significantly above normal rates',
      severity: 'high',
      category: 'billing'
    },
    {
      id: 'RULE_007',
      name: 'Date Range Violations',
      description: 'Detects services billed outside appropriate timeframes',
      severity: 'medium',
      category: 'compliance'
    },
    {
      id: 'RULE_008',
      name: 'Missing Diagnosis Codes',
      description: 'Identifies services without supporting diagnosis codes',
      severity: 'medium',
      category: 'documentation'
    },
    {
      id: 'RULE_009',
      name: 'Invalid Code Combinations',
      description: 'Detects incompatible CPT and diagnosis code combinations',
      severity: 'high',
      category: 'coding'
    },
    {
      id: 'RULE_010',
      name: 'Frequency Violations',
      description: 'Identifies services billed more frequently than medically necessary',
      severity: 'high',
      category: 'compliance'
    },
    {
      id: 'RULE_011',
      name: 'Place of Service Errors',
      description: 'Validates appropriate place of service codes',
      severity: 'medium',
      category: 'coding'
    },
    {
      id: 'RULE_012',
      name: 'Gender-Specific Service Violations',
      description: 'Detects gender-specific services billed inappropriately',
      severity: 'high',
      category: 'coding'
    },
    {
      id: 'RULE_013',
      name: 'Age-Specific Service Violations',
      description: 'Identifies age-inappropriate services',
      severity: 'high',
      category: 'coding'
    },
    {
      id: 'RULE_014',
      name: 'Bilateral Service Errors',
      description: 'Validates bilateral procedures and modifier usage',
      severity: 'medium',
      category: 'coding'
    },
    {
      id: 'RULE_015',
      name: 'Mutually Exclusive Procedures',
      description: 'Detects procedures that cannot be performed together',
      severity: 'critical',
      category: 'coding'
    },
    {
      id: 'RULE_016',
      name: 'Authorization Requirements',
      description: 'Identifies services requiring prior authorization',
      severity: 'critical',
      category: 'compliance'
    },
    {
      id: 'RULE_017',
      name: 'Global Period Violations',
      description: 'Detects services billed during global periods',
      severity: 'high',
      category: 'billing'
    },
    {
      id: 'RULE_018',
      name: 'Incomplete Documentation',
      description: 'Identifies insufficient documentation for billed services',
      severity: 'medium',
      category: 'documentation'
    }
  ]

  /**
   * Analyze line items against all billing rules
   */
  async analyzeLineItems(lineItems: LineItemForAnalysis[]): Promise<RuleViolation[]> {
    console.log(`🔍 Running billing rules analysis on ${lineItems.length} line items`)

    const violations: RuleViolation[] = []

    // Run each rule
    violations.push(...this.checkDuplicateServiceCodes(lineItems))
    violations.push(...this.checkUnbundlingViolations(lineItems))
    violations.push(...this.checkUpcodingDetection(lineItems))
    violations.push(...this.checkModifierAbuse(lineItems))
    violations.push(...this.checkUnitsValidation(lineItems))
    violations.push(...this.checkExcessiveCharges(lineItems))
    violations.push(...this.checkDateRangeViolations(lineItems))
    violations.push(...this.checkMissingDiagnosisCodes(lineItems))
    violations.push(...this.checkInvalidCodeCombinations(lineItems))
    violations.push(...this.checkFrequencyViolations(lineItems))
    violations.push(...this.checkPlaceOfServiceErrors(lineItems))
    violations.push(...this.checkGenderSpecificViolations(lineItems))
    violations.push(...this.checkAgeSpecificViolations(lineItems))
    violations.push(...this.checkBilateralServiceErrors(lineItems))
    violations.push(...this.checkMutuallyExclusiveProcedures(lineItems))
    violations.push(...this.checkAuthorizationRequirements(lineItems))
    violations.push(...this.checkGlobalPeriodViolations(lineItems))
    violations.push(...this.checkIncompleteDocumentation(lineItems))

    console.log(`📊 Analysis complete: ${violations.length} violations found`)
    return violations
  }

  private checkDuplicateServiceCodes(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    const violations: RuleViolation[] = []
    const codesByDate: { [key: string]: LineItemForAnalysis[] } = {}

    // Group by service date and CPT code
    lineItems.forEach(item => {
      if (item.cpt_code && item.service_date) {
        const key = `${item.service_date}-${item.cpt_code}`
        if (!codesByDate[key]) codesByDate[key] = []
        codesByDate[key].push(item)
      }
    })

    // Check for duplicates
    Object.entries(codesByDate).forEach(([key, items]) => {
      if (items.length > 1) {
        const [date, code] = key.split('-')
        violations.push({
          ruleId: 'RULE_001',
          ruleName: 'Duplicate Service Codes',
          severity: 'high',
          description: 'Duplicate CPT codes found on the same service date',
          details: `CPT code ${code} appears ${items.length} times on ${date}`,
          affectedLineItems: items.map(item => item.line_number),
          evidence: [`${items.length} instances of CPT ${code} on ${date}`],
          recommendations: ['Review medical necessity for duplicate services', 'Consider appropriate modifiers if services are distinct']
        })
      }
    })

    return violations
  }

  private checkUnbundlingViolations(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    const violations: RuleViolation[] = []

    // Common bundling violations (simplified examples)
    const bundlingRules = [
      { comprehensive: '99214', components: ['99213', '36415'], description: 'Office visit with venipuncture' },
      { comprehensive: '99215', components: ['99214', '93000'], description: 'Complex office visit with EKG' }
    ]

    bundlingRules.forEach(rule => {
      const comprehensiveService = lineItems.find(item => item.cpt_code === rule.comprehensive)
      const componentServices = lineItems.filter(item => rule.components.includes(item.cpt_code || ''))

      if (!comprehensiveService && componentServices.length >= 2) {
        violations.push({
          ruleId: 'RULE_002',
          ruleName: 'Unbundling Violations',
          severity: 'critical',
          description: 'Services billed separately that should be bundled',
          details: `Components of ${rule.description} billed separately instead of comprehensive code ${rule.comprehensive}`,
          affectedLineItems: componentServices.map(item => item.line_number),
          evidence: [`Found component codes: ${componentServices.map(s => s.cpt_code).join(', ')}`],
          recommendations: [`Consider using comprehensive code ${rule.comprehensive} instead of separate components`]
        })
      }
    })

    return violations
  }

  private checkUpcodingDetection(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    const violations: RuleViolation[] = []

    // E&M upcoding detection (simplified)
    const officeVisitCodes = ['99211', '99212', '99213', '99214', '99215']
    const officeVisits = lineItems.filter(item => officeVisitCodes.includes(item.cpt_code || ''))

    // Flag if more than 50% are high-level visits (99214, 99215)
    const highLevelVisits = officeVisits.filter(item => ['99214', '99215'].includes(item.cpt_code || ''))

    if (officeVisits.length > 0 && (highLevelVisits.length / officeVisits.length) > 0.5) {
      violations.push({
        ruleId: 'RULE_003',
        ruleName: 'Upcoding Detection',
        severity: 'critical',
        description: 'Unusually high percentage of high-level office visits',
        details: `${highLevelVisits.length} of ${officeVisits.length} office visits are high-level (99214/99215)`,
        affectedLineItems: highLevelVisits.map(item => item.line_number),
        evidence: [`${Math.round((highLevelVisits.length / officeVisits.length) * 100)}% high-level visits`],
        recommendations: ['Review documentation to ensure complexity justifies high-level codes']
      })
    }

    return violations
  }

  private checkModifierAbuse(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    const violations: RuleViolation[] = []

    lineItems.forEach(item => {
      if (item.modifier_codes && item.modifier_codes.length > 0) {
        // Check for overuse of modifier 25
        if (item.modifier_codes.includes('-25')) {
          violations.push({
            ruleId: 'RULE_004',
            ruleName: 'Modifier Abuse',
            severity: 'high',
            description: 'Potential overuse of modifier 25',
            details: `Modifier 25 used with CPT ${item.cpt_code}`,
            affectedLineItems: [item.line_number],
            evidence: [`Modifier 25 applied to ${item.cpt_code}`],
            recommendations: ['Verify that E&M service is significant and separately identifiable']
          })
        }

        // Check for excessive modifiers
        if (item.modifier_codes.length > 2) {
          violations.push({
            ruleId: 'RULE_004',
            ruleName: 'Modifier Abuse',
            severity: 'medium',
            description: 'Excessive number of modifiers',
            details: `${item.modifier_codes.length} modifiers applied to CPT ${item.cpt_code}`,
            affectedLineItems: [item.line_number],
            evidence: [`Modifiers: ${item.modifier_codes.join(', ')}`],
            recommendations: ['Review necessity of multiple modifiers']
          })
        }
      }
    })

    return violations
  }

  private checkUnitsValidation(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    const violations: RuleViolation[] = []

    lineItems.forEach(item => {
      if (item.units && item.units > 1) {
        // Check for inappropriate unit billing
        const singleUnitCodes = ['99213', '99214', '99215'] // Office visits should typically be 1 unit

        if (singleUnitCodes.includes(item.cpt_code || '') && item.units > 1) {
          violations.push({
            ruleId: 'RULE_005',
            ruleName: 'Units Validation',
            severity: 'medium',
            description: 'Inappropriate units for service type',
            details: `${item.units} units billed for ${item.cpt_code} (${item.code_description})`,
            affectedLineItems: [item.line_number],
            evidence: [`${item.units} units for ${item.cpt_code}`],
            recommendations: ['Verify medical necessity for multiple units']
          })
        }
      }
    })

    return violations
  }

  private checkExcessiveCharges(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    const violations: RuleViolation[] = []

    // Typical charge ranges (simplified example)
    const typicalCharges: { [key: string]: { min: number, max: number } } = {
      '99213': { min: 100, max: 200 },
      '99214': { min: 150, max: 300 },
      '99215': { min: 200, max: 400 }
    }

    lineItems.forEach(item => {
      if (item.cpt_code && item.charge_amount && typicalCharges[item.cpt_code]) {
        const range = typicalCharges[item.cpt_code]

        if (item.charge_amount > range.max * 1.5) { // 50% above normal range
          violations.push({
            ruleId: 'RULE_006',
            ruleName: 'Excessive Charges',
            severity: 'high',
            description: 'Charge significantly above normal range',
            details: `Charge of $${item.charge_amount} for ${item.cpt_code} exceeds typical range ($${range.min}-$${range.max})`,
            affectedLineItems: [item.line_number],
            potentialSavings: item.charge_amount - range.max,
            evidence: [`Charge: $${item.charge_amount}, Typical range: $${range.min}-$${range.max}`],
            recommendations: ['Review charge against local market rates']
          })
        }
      }
    })

    return violations
  }

  private checkDateRangeViolations(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    const violations: RuleViolation[] = []
    const currentDate = new Date()

    lineItems.forEach(item => {
      if (item.service_date) {
        const serviceDate = new Date(item.service_date)
        const daysDiff = Math.floor((currentDate.getTime() - serviceDate.getTime()) / (1000 * 60 * 60 * 24))

        // Flag services older than 1 year
        if (daysDiff > 365) {
          violations.push({
            ruleId: 'RULE_007',
            ruleName: 'Date Range Violations',
            severity: 'medium',
            description: 'Service date outside normal billing timeframe',
            details: `Service performed ${daysDiff} days ago (${item.service_date})`,
            affectedLineItems: [item.line_number],
            evidence: [`Service date: ${item.service_date} (${daysDiff} days ago)`],
            recommendations: ['Verify timely filing requirements']
          })
        }
      }
    })

    return violations
  }

  private checkMissingDiagnosisCodes(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    const violations: RuleViolation[] = []

    lineItems.forEach(item => {
      if (item.cpt_code && (!item.diagnosis_codes || item.diagnosis_codes.length === 0)) {
        violations.push({
          ruleId: 'RULE_008',
          ruleName: 'Missing Diagnosis Codes',
          severity: 'medium',
          description: 'Service billed without supporting diagnosis codes',
          details: `CPT ${item.cpt_code} (${item.code_description}) has no diagnosis codes`,
          affectedLineItems: [item.line_number],
          evidence: [`No diagnosis codes for ${item.cpt_code}`],
          recommendations: ['Add appropriate ICD-10 diagnosis codes']
        })
      }
    })

    return violations
  }

  // Simplified implementations for remaining rules
  private checkInvalidCodeCombinations(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    return [] // Implementation would check for incompatible CPT/ICD combinations
  }

  private checkFrequencyViolations(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    return [] // Implementation would check for services billed too frequently
  }

  private checkPlaceOfServiceErrors(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    return [] // Implementation would validate place of service codes
  }

  private checkGenderSpecificViolations(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    return [] // Implementation would check gender-specific procedures
  }

  private checkAgeSpecificViolations(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    return [] // Implementation would check age-inappropriate services
  }

  private checkBilateralServiceErrors(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    return [] // Implementation would validate bilateral procedures
  }

  private checkMutuallyExclusiveProcedures(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    return [] // Implementation would check for incompatible procedures
  }

  private checkAuthorizationRequirements(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    return [] // Implementation would check for required authorizations
  }

  private checkGlobalPeriodViolations(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    return [] // Implementation would check global period conflicts
  }

  private checkIncompleteDocumentation(lineItems: LineItemForAnalysis[]): RuleViolation[] {
    return [] // Implementation would check documentation requirements
  }
}