import { GroundedAnswer, WyngCitation } from './grounded-answer-synthesis'
import { IntentClassificationV2 } from './canonical-intent-classifier'

export interface SafetyCheck {
  checkType: 'medical_advice' | 'legal_advice' | 'financial_advice' | 'emergency' | 'discrimination' | 'privacy'
  severity: 'low' | 'medium' | 'high' | 'critical'
  triggered: boolean
  reason: string
  recommendation: string
  requiresIntervention: boolean
}

export interface ComplianceCheck {
  regulation: 'HIPAA' | 'FDA' | 'FTC' | 'state_insurance' | 'medical_practice' | 'accessibility'
  compliant: boolean
  issues: string[]
  recommendations: string[]
  requiredDisclosures: string[]
}

export interface SafetyComplianceResult {
  overallSafe: boolean
  overallCompliant: boolean
  safetyChecks: SafetyCheck[]
  complianceChecks: ComplianceCheck[]
  requiredDisclaimers: string[]
  blockedResponse: boolean
  interventionRequired: boolean
  modifiedAnswer?: GroundedAnswer
}

export class SafetyComplianceEngine {
  private static readonly MEDICAL_ADVICE_PATTERNS = [
    /you should take/gi,
    /i recommend taking/gi,
    /you need to start/gi,
    /stop taking your medication/gi,
    /change your dosage/gi,
    /this medication will/gi,
    /you should not take/gi,
    /skip your doctor/gi,
    /avoid seeing a doctor/gi,
    /you don't need a doctor/gi
  ]

  private static readonly LEGAL_ADVICE_PATTERNS = [
    /you should sue/gi,
    /file a lawsuit/gi,
    /you have a strong case/gi,
    /this is definitely illegal/gi,
    /you will win in court/gi,
    /contact a lawyer immediately/gi,
    /this violates the law/gi,
    /you should represent yourself/gi
  ]

  private static readonly EMERGENCY_PATTERNS = [
    /heart attack/gi,
    /stroke/gi,
    /severe bleeding/gi,
    /difficulty breathing/gi,
    /chest pain/gi,
    /emergency room/gi,
    /call 911/gi,
    /life threatening/gi,
    /urgent medical attention/gi
  ]

  private static readonly DISCRIMINATION_PATTERNS = [
    /because of your race/gi,
    /due to your gender/gi,
    /your disability makes you/gi,
    /people like you/gi,
    /your religion means/gi,
    /your age disqualifies/gi
  ]

  private static readonly REQUIRED_DISCLAIMERS = {
    general: "This information is for educational purposes only and should not replace professional medical or legal advice.",
    medical: "This guidance does not constitute medical advice. Consult your healthcare provider for medical decisions.",
    legal: "This information is not legal advice. Consult with a qualified attorney for legal matters.",
    emergency: "If this is a medical emergency, call 911 or go to your nearest emergency room immediately.",
    insurance: "Insurance coverage varies by plan. Verify benefits with your insurance company.",
    accuracy: "While we strive for accuracy, insurance rules and regulations change frequently. Always verify current information."
  }

  static checkSafetyCompliance(
    answer: GroundedAnswer,
    intent: IntentClassificationV2,
    userMessage: string
  ): SafetyComplianceResult {

    console.log('🛡️ Running safety and compliance checks')

    const safetyChecks = this.performSafetyChecks(answer, userMessage)
    const complianceChecks = this.performComplianceChecks(answer, intent)

    const overallSafe = !safetyChecks.some(check => check.severity === 'critical' && check.triggered)
    const overallCompliant = complianceChecks.every(check => check.compliant)

    const interventionRequired = safetyChecks.some(check =>
      check.triggered && check.requiresIntervention
    )

    const blockedResponse = safetyChecks.some(check =>
      check.triggered && check.severity === 'critical'
    )

    // Generate required disclaimers
    const requiredDisclaimers = this.generateRequiredDisclaimers(
      safetyChecks,
      complianceChecks,
      intent
    )

    // Modify answer if needed but not blocked
    let modifiedAnswer: GroundedAnswer | undefined
    if (!blockedResponse && (safetyChecks.some(c => c.triggered) || !overallCompliant)) {
      modifiedAnswer = this.modifyAnswerForSafety(answer, safetyChecks, complianceChecks)
    }

    return {
      overallSafe,
      overallCompliant,
      safetyChecks,
      complianceChecks,
      requiredDisclaimers,
      blockedResponse,
      interventionRequired,
      modifiedAnswer
    }
  }

  private static performSafetyChecks(
    answer: GroundedAnswer,
    userMessage: string
  ): SafetyCheck[] {

    const checks: SafetyCheck[] = []
    const fullText = `${answer.paragraphExplanation} ${answer.specificGuidance.join(' ')} ${answer.actionableSteps.join(' ')}`

    // Medical advice check
    const medicalAdviceCheck = this.checkMedicalAdvice(fullText, userMessage)
    checks.push(medicalAdviceCheck)

    // Legal advice check
    const legalAdviceCheck = this.checkLegalAdvice(fullText, userMessage)
    checks.push(legalAdviceCheck)

    // Emergency situation check
    const emergencyCheck = this.checkEmergencyContent(fullText, userMessage)
    checks.push(emergencyCheck)

    // Discrimination check
    const discriminationCheck = this.checkDiscrimination(fullText)
    checks.push(discriminationCheck)

    // Privacy check
    const privacyCheck = this.checkPrivacyCompliance(fullText, userMessage)
    checks.push(privacyCheck)

    // Financial advice check
    const financialAdviceCheck = this.checkFinancialAdvice(fullText)
    checks.push(financialAdviceCheck)

    return checks
  }

  private static checkMedicalAdvice(text: string, userMessage: string): SafetyCheck {
    let triggered = false
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
    let reason = ''

    // Check for direct medical advice patterns
    for (const pattern of this.MEDICAL_ADVICE_PATTERNS) {
      if (pattern.test(text)) {
        triggered = true
        severity = 'high'
        reason = `Detected potential medical advice: "${text.match(pattern)?.[0]}"`
        break
      }
    }

    // Check for medication-specific advice
    if (text.match(/take.*medication|stop.*drug|increase.*dose/gi)) {
      triggered = true
      severity = 'critical'
      reason = 'Providing specific medication advice'
    }

    // Check for diagnostic statements
    if (text.match(/you have.*condition|you are diagnosed|you suffer from/gi)) {
      triggered = true
      severity = 'high'
      reason = 'Making diagnostic statements'
    }

    return {
      checkType: 'medical_advice',
      severity,
      triggered,
      reason: reason || 'No medical advice detected',
      recommendation: triggered ?
        'Remove medical advice and add disclaimer to consult healthcare provider' :
        'Continue with standard health information disclaimers',
      requiresIntervention: severity === 'critical'
    }
  }

  private static checkLegalAdvice(text: string, userMessage: string): SafetyCheck {
    let triggered = false
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
    let reason = ''

    // Check for direct legal advice patterns
    for (const pattern of this.LEGAL_ADVICE_PATTERNS) {
      if (pattern.test(text)) {
        triggered = true
        severity = 'high'
        reason = `Detected potential legal advice: "${text.match(pattern)?.[0]}"`
        break
      }
    }

    // Check for definitive legal statements
    if (text.match(/this is illegal|you have the right to sue|file a complaint with|this violates/gi)) {
      triggered = true
      severity = 'medium'
      reason = 'Making definitive legal statements'
    }

    return {
      checkType: 'legal_advice',
      severity,
      triggered,
      reason: reason || 'No legal advice detected',
      recommendation: triggered ?
        'Soften language and add disclaimer about consulting legal counsel' :
        'Continue with standard legal information disclaimers',
      requiresIntervention: severity === 'critical'
    }
  }

  private static checkEmergencyContent(text: string, userMessage: string): SafetyCheck {
    let triggered = false
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
    let reason = ''

    // Check for emergency medical situations
    for (const pattern of this.EMERGENCY_PATTERNS) {
      if (pattern.test(userMessage) || pattern.test(text)) {
        triggered = true
        severity = 'critical'
        reason = `Emergency situation detected: "${(userMessage + text).match(pattern)?.[0]}"`
        break
      }
    }

    // Check for urgent care language
    if (text.match(/immediately|urgent|asap|right away|don't wait/gi) &&
        text.match(/medical|doctor|emergency|hospital/gi)) {
      triggered = true
      severity = 'high'
      reason = 'Urgent medical language detected'
    }

    return {
      checkType: 'emergency',
      severity,
      triggered,
      reason: reason || 'No emergency content detected',
      recommendation: triggered ?
        'Add prominent emergency disclaimer and direct to appropriate care' :
        'No emergency intervention needed',
      requiresIntervention: severity === 'critical'
    }
  }

  private static checkDiscrimination(text: string): SafetyCheck {
    let triggered = false
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
    let reason = ''

    // Check for discriminatory patterns
    for (const pattern of this.DISCRIMINATION_PATTERNS) {
      if (pattern.test(text)) {
        triggered = true
        severity = 'critical'
        reason = `Potential discriminatory content: "${text.match(pattern)?.[0]}"`
        break
      }
    }

    // Check for bias in advice
    if (text.match(/people like you|your type|your kind/gi)) {
      triggered = true
      severity = 'high'
      reason = 'Potentially biased language detected'
    }

    return {
      checkType: 'discrimination',
      severity,
      triggered,
      reason: reason || 'No discriminatory content detected',
      recommendation: triggered ?
        'Remove discriminatory language and ensure inclusive guidance' :
        'Content appears inclusive and non-discriminatory',
      requiresIntervention: severity === 'critical'
    }
  }

  private static checkPrivacyCompliance(text: string, userMessage: string): SafetyCheck {
    let triggered = false
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
    let reason = ''

    // Check for potential PII exposure
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      /\b\d{16}\b/g, // Credit card
      /\b[A-Z]{2}\d{7}[A-Z]\b/g, // Insurance member ID pattern
      /\b\d{10}\b/g // Phone number
    ]

    for (const pattern of piiPatterns) {
      if (pattern.test(text) || pattern.test(userMessage)) {
        triggered = true
        severity = 'critical'
        reason = 'Potential PII detected in response or input'
        break
      }
    }

    // Check for privacy-sensitive content
    if (text.match(/your medical records|your personal information|share your data/gi)) {
      triggered = true
      severity = 'medium'
      reason = 'Privacy-sensitive content requiring additional disclosures'
    }

    return {
      checkType: 'privacy',
      severity,
      triggered,
      reason: reason || 'No privacy issues detected',
      recommendation: triggered ?
        'Remove PII and add privacy protection disclaimers' :
        'Standard privacy practices sufficient',
      requiresIntervention: severity === 'critical'
    }
  }

  private static checkFinancialAdvice(text: string): SafetyCheck {
    let triggered = false
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
    let reason = ''

    // Check for specific financial advice
    if (text.match(/you should invest|buy this insurance|this plan is better|choose this option/gi)) {
      triggered = true
      severity = 'high'
      reason = 'Providing specific financial/insurance purchasing advice'
    }

    // Check for cost guarantees
    if (text.match(/you will pay|guaranteed cost|this will cost exactly/gi)) {
      triggered = true
      severity = 'medium'
      reason = 'Making cost guarantees that may vary'
    }

    return {
      checkType: 'financial_advice',
      severity,
      triggered,
      reason: reason || 'No financial advice detected',
      recommendation: triggered ?
        'Soften financial language and add disclaimers about plan variations' :
        'Standard insurance information practices sufficient',
      requiresIntervention: severity === 'critical'
    }
  }

  private static performComplianceChecks(
    answer: GroundedAnswer,
    intent: IntentClassificationV2
  ): ComplianceCheck[] {

    const checks: ComplianceCheck[] = []

    // HIPAA compliance check
    checks.push(this.checkHIPAACompliance(answer))

    // FDA compliance check (for medication/device information)
    checks.push(this.checkFDACompliance(answer, intent))

    // FTC compliance check (for advertising/claims)
    checks.push(this.checkFTCCompliance(answer))

    // State insurance regulation compliance
    checks.push(this.checkStateInsuranceCompliance(answer, intent))

    // Medical practice compliance
    checks.push(this.checkMedicalPracticeCompliance(answer))

    // Accessibility compliance
    checks.push(this.checkAccessibilityCompliance(answer))

    return checks
  }

  private static checkHIPAACompliance(answer: GroundedAnswer): ComplianceCheck {
    const issues: string[] = []
    const recommendations: string[] = []
    const requiredDisclosures: string[] = []

    // Check for privacy protection language
    const fullText = `${answer.paragraphExplanation} ${answer.specificGuidance.join(' ')}`

    if (fullText.match(/medical records|health information|personal health data/gi)) {
      requiredDisclosures.push('This platform does not store or access your personal health information')
    }

    if (!answer.disclaimers.some(d => d.includes('privacy') || d.includes('confidential'))) {
      recommendations.push('Add privacy protection disclaimer')
    }

    return {
      regulation: 'HIPAA',
      compliant: issues.length === 0,
      issues,
      recommendations,
      requiredDisclosures
    }
  }

  private static checkFDACompliance(answer: GroundedAnswer, intent: IntentClassificationV2): ComplianceCheck {
    const issues: string[] = []
    const recommendations: string[] = []
    const requiredDisclosures: string[] = []

    const fullText = `${answer.paragraphExplanation} ${answer.specificGuidance.join(' ')}`

    // Check for drug/device claims
    if (fullText.match(/this medication will cure|this device treats|proven to work/gi)) {
      issues.push('Making therapeutic claims without FDA approval language')
      recommendations.push('Add FDA disclaimer for therapeutic claims')
    }

    // Check for prescription medication discussion
    if (intent.primaryIntent.tags.careType?.includes('pharmacy') ||
        fullText.match(/prescription|medication|drug/gi)) {
      requiredDisclosures.push('Medication information is for educational purposes only')
    }

    return {
      regulation: 'FDA',
      compliant: issues.length === 0,
      issues,
      recommendations,
      requiredDisclosures
    }
  }

  private static checkFTCCompliance(answer: GroundedAnswer): ComplianceCheck {
    const issues: string[] = []
    const recommendations: string[] = []
    const requiredDisclosures: string[] = []

    const fullText = `${answer.paragraphExplanation} ${answer.specificGuidance.join(' ')}`

    // Check for unsubstantiated claims
    if (fullText.match(/guaranteed|always works|never fails|100% success/gi)) {
      issues.push('Making unsubstantiated guarantee claims')
      recommendations.push('Qualify claims with appropriate disclaimers')
    }

    // Check for clear disclosures
    if (fullText.match(/free|no cost|covered at 100%/gi) &&
        !fullText.match(/may vary|depends on plan|verify with insurance/gi)) {
      recommendations.push('Add disclaimers about plan variations for cost claims')
    }

    return {
      regulation: 'FTC',
      compliant: issues.length === 0,
      issues,
      recommendations,
      requiredDisclosures
    }
  }

  private static checkStateInsuranceCompliance(
    answer: GroundedAnswer,
    intent: IntentClassificationV2
  ): ComplianceCheck {
    const issues: string[] = []
    const recommendations: string[] = []
    const requiredDisclosures: string[] = []

    // Check for state-specific advice without jurisdiction context
    const fullText = `${answer.paragraphExplanation} ${answer.specificGuidance.join(' ')}`

    if (fullText.match(/state law requires|your state mandates/gi) &&
        !intent.tags.jurisdiction) {
      issues.push('Making state-specific claims without jurisdiction identification')
      recommendations.push('Qualify state law references with jurisdiction information')
    }

    // Check for insurance licensing implications
    if (fullText.match(/you should buy|recommend this plan|best insurance option/gi)) {
      issues.push('Providing insurance purchasing advice without licensing disclosures')
      requiredDisclosures.push('This information is educational only and not insurance sales advice')
    }

    return {
      regulation: 'state_insurance',
      compliant: issues.length === 0,
      issues,
      recommendations,
      requiredDisclosures
    }
  }

  private static checkMedicalPracticeCompliance(answer: GroundedAnswer): ComplianceCheck {
    const issues: string[] = []
    const recommendations: string[] = []
    const requiredDisclosures: string[] = []

    const fullText = `${answer.paragraphExplanation} ${answer.specificGuidance.join(' ')}`

    // Check for unlicensed practice of medicine
    if (fullText.match(/you have|diagnosed with|medical condition|treatment plan/gi)) {
      issues.push('Language could be interpreted as practicing medicine')
      recommendations.push('Use informational language and add medical practice disclaimers')
      requiredDisclosures.push('This information does not constitute medical diagnosis or treatment')
    }

    return {
      regulation: 'medical_practice',
      compliant: issues.length === 0,
      issues,
      recommendations,
      requiredDisclosures
    }
  }

  private static checkAccessibilityCompliance(answer: GroundedAnswer): ComplianceCheck {
    const issues: string[] = []
    const recommendations: string[] = []
    const requiredDisclosures: string[] = []

    // Check for plain language compliance
    const fullText = `${answer.paragraphExplanation} ${answer.specificGuidance.join(' ')}`
    const avgWordsPerSentence = this.calculateAverageWordsPerSentence(fullText)

    if (avgWordsPerSentence > 20) {
      recommendations.push('Consider shorter sentences for better accessibility')
    }

    // Check for jargon
    const medicalJargon = fullText.match(/utilization|prior authorization|formulary|deductible|coinsurance/gi)
    if (medicalJargon && medicalJargon.length > 3) {
      recommendations.push('Consider defining medical terms for accessibility')
    }

    return {
      regulation: 'accessibility',
      compliant: issues.length === 0,
      issues,
      recommendations,
      requiredDisclosures
    }
  }

  private static calculateAverageWordsPerSentence(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const totalWords = text.split(/\s+/).length
    return sentences.length > 0 ? totalWords / sentences.length : 0
  }

  private static generateRequiredDisclaimers(
    safetyChecks: SafetyCheck[],
    complianceChecks: ComplianceCheck[],
    intent: IntentClassificationV2
  ): string[] {

    const disclaimers = new Set<string>()

    // Always include general disclaimer
    disclaimers.add(this.REQUIRED_DISCLAIMERS.general)

    // Add safety-based disclaimers
    safetyChecks.forEach(check => {
      if (check.triggered) {
        switch (check.checkType) {
          case 'medical_advice':
            disclaimers.add(this.REQUIRED_DISCLAIMERS.medical)
            break
          case 'legal_advice':
            disclaimers.add(this.REQUIRED_DISCLAIMERS.legal)
            break
          case 'emergency':
            disclaimers.add(this.REQUIRED_DISCLAIMERS.emergency)
            break
        }
      }
    })

    // Add compliance-based disclaimers
    complianceChecks.forEach(check => {
      check.requiredDisclosures.forEach(disclosure => {
        disclaimers.add(disclosure)
      })
    })

    // Add intent-specific disclaimers
    if (intent.primaryIntent.theme.includes('Appeals') ||
        intent.primaryIntent.theme.includes('Legal')) {
      disclaimers.add(this.REQUIRED_DISCLAIMERS.legal)
    }

    disclaimers.add(this.REQUIRED_DISCLAIMERS.insurance)
    disclaimers.add(this.REQUIRED_DISCLAIMERS.accuracy)

    return Array.from(disclaimers)
  }

  private static modifyAnswerForSafety(
    answer: GroundedAnswer,
    safetyChecks: SafetyCheck[],
    complianceChecks: ComplianceCheck[]
  ): GroundedAnswer {

    let modifiedAnswer = { ...answer }

    // Modify text based on safety checks
    safetyChecks.forEach(check => {
      if (check.triggered && check.severity !== 'critical') {
        modifiedAnswer = this.applySafetyModification(modifiedAnswer, check)
      }
    })

    // Add compliance-required disclaimers
    const requiredDisclaimers = this.generateRequiredDisclaimers(
      safetyChecks,
      complianceChecks,
      { primaryIntent: { theme: '' } } as any // Simplified for this context
    )

    modifiedAnswer.disclaimers = [...modifiedAnswer.disclaimers, ...requiredDisclaimers]

    return modifiedAnswer
  }

  private static applySafetyModification(
    answer: GroundedAnswer,
    check: SafetyCheck
  ): GroundedAnswer {

    const modified = { ...answer }

    switch (check.checkType) {
      case 'medical_advice':
        // Soften medical language
        modified.paragraphExplanation = modified.paragraphExplanation
          .replace(/you should take/gi, 'your doctor may recommend')
          .replace(/you must/gi, 'it may be important to')
          .replace(/you have/gi, 'your condition may involve')

        break

      case 'legal_advice':
        // Soften legal language
        modified.paragraphExplanation = modified.paragraphExplanation
          .replace(/you should sue/gi, 'you may want to consult an attorney about')
          .replace(/this is illegal/gi, 'this may violate regulations')
          .replace(/you will win/gi, 'you may have grounds for')

        break

      case 'financial_advice':
        // Add qualifiers to financial statements
        modified.paragraphExplanation = modified.paragraphExplanation
          .replace(/you will pay/gi, 'you may be responsible for')
          .replace(/this costs/gi, 'typical costs may be')

        break
    }

    return modified
  }

  static generateEmergencyResponse(): GroundedAnswer {
    return {
      paragraphExplanation: "This appears to be a medical emergency situation. If you're experiencing a life-threatening emergency, please call 911 or go to your nearest emergency room immediately.",
      specificGuidance: [
        "Call 911 for immediate medical emergencies",
        "Go to the nearest emergency room for urgent care",
        "Contact your doctor or urgent care for non-emergency medical concerns"
      ],
      actionableSteps: [
        "If this is an emergency: Call 911 now",
        "For urgent but non-emergency care: Contact your healthcare provider",
        "Keep your insurance card and ID with you when seeking care",
        "Follow up with your primary care doctor after emergency treatment"
      ],
      citations: [],
      confidenceScore: 1.0,
      requiresClarification: false,
      disclaimers: [
        "This is an automated response for emergency situations",
        "Always prioritize immediate medical care over insurance concerns in emergencies",
        "Emergency services are required to treat you regardless of insurance status"
      ]
    }
  }
}