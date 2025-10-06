import { GroundedAnswer } from './grounded-answer-synthesis'
import { IntentClassificationV2 } from './canonical-intent-classifier'
import { SafetyComplianceResult } from './safety-compliance'
import { HybridRetrievalContext } from './hybrid-retrieval'

export interface FeatureFlags {
  CHAT_INTENTS_V2: boolean
  DOC_INGEST_MULTI: boolean
  GROUNDED_CITATIONS: boolean
  HYBRID_RETRIEVAL: boolean
  SAFETY_CHECKS: boolean
  EVALUATION_GATES: boolean
  JURISDICTION_BOOST: boolean
  CANONICAL_QUESTIONS: boolean
  ANSWER_TEMPLATE_V2: boolean
  CITATION_VALIDATION: boolean
}

export interface EvaluationGate {
  name: string
  description: string
  threshold: number
  required: boolean
  weight: number
}

export interface EvaluationResult {
  gate: string
  passed: boolean
  score: number
  threshold: number
  details: string
  recommendations: string[]
}

export interface QualityAssessment {
  overallScore: number
  gatePassed: boolean
  evaluationResults: EvaluationResult[]
  allowedToRespond: boolean
  fallbackRequired: boolean
  improvementSuggestions: string[]
  confidenceAdjustment: number
}

export class EvaluationGatesEngine {
  private static featureFlags: FeatureFlags = {
    CHAT_INTENTS_V2: true,
    DOC_INGEST_MULTI: true,
    GROUNDED_CITATIONS: true,
    HYBRID_RETRIEVAL: true,
    SAFETY_CHECKS: true,
    EVALUATION_GATES: true,
    JURISDICTION_BOOST: true,
    CANONICAL_QUESTIONS: true,
    ANSWER_TEMPLATE_V2: true,
    CITATION_VALIDATION: true
  }

  private static evaluationGates: EvaluationGate[] = [
    {
      name: 'intent_routing_accuracy',
      description: 'Accuracy of intent classification and routing',
      threshold: 0.6,
      required: true,
      weight: 0.25
    },
    {
      name: 'grounded_answer_quality',
      description: 'Quality and grounding of generated answers',
      threshold: 0.7,
      required: true,
      weight: 0.30
    },
    {
      name: 'citation_accuracy',
      description: 'Accuracy and relevance of citations',
      threshold: 0.8,
      required: true,
      weight: 0.20
    },
    {
      name: 'safety_compliance',
      description: 'Safety and regulatory compliance',
      threshold: 0.9,
      required: true,
      weight: 0.15
    },
    {
      name: 'answer_completeness',
      description: 'Completeness and actionability of guidance',
      threshold: 0.65,
      required: false,
      weight: 0.10
    }
  ]

  static initialize(customFlags?: Partial<FeatureFlags>): void {
    console.log('🚪 Initializing Evaluation Gates and Feature Flags')

    if (customFlags) {
      this.featureFlags = { ...this.featureFlags, ...customFlags }
    }

    // Load flags from environment if available
    Object.keys(this.featureFlags).forEach(flag => {
      const envValue = process.env[`WYNG_${flag}`]
      if (envValue !== undefined) {
        this.featureFlags[flag as keyof FeatureFlags] = envValue === 'true'
      }
    })

    console.log('✅ Feature flags configured:', this.featureFlags)
  }

  static isFeatureEnabled(feature: keyof FeatureFlags): boolean {
    return this.featureFlags[feature] === true
  }

  static evaluateResponse(
    answer: GroundedAnswer,
    intent: IntentClassificationV2,
    retrievalContext: HybridRetrievalContext,
    safetyResult: SafetyComplianceResult,
    userMessage: string
  ): QualityAssessment {

    console.log('📊 Running evaluation gates on response')

    const evaluationResults: EvaluationResult[] = []

    // Gate 1: Intent Routing Accuracy
    if (this.isFeatureEnabled('CHAT_INTENTS_V2')) {
      const intentResult = this.evaluateIntentRoutingAccuracy(intent, userMessage)
      evaluationResults.push(intentResult)
    }

    // Gate 2: Grounded Answer Quality
    if (this.isFeatureEnabled('GROUNDED_CITATIONS')) {
      const answerResult = this.evaluateGroundedAnswerQuality(answer, retrievalContext)
      evaluationResults.push(answerResult)
    }

    // Gate 3: Citation Accuracy
    if (this.isFeatureEnabled('CITATION_VALIDATION')) {
      const citationResult = this.evaluateCitationAccuracy(answer.citations, retrievalContext)
      evaluationResults.push(citationResult)
    }

    // Gate 4: Safety and Compliance
    if (this.isFeatureEnabled('SAFETY_CHECKS')) {
      const safetyResult_ = this.evaluateSafetyCompliance(safetyResult)
      evaluationResults.push(safetyResult_)
    }

    // Gate 5: Answer Completeness
    const completenessResult = this.evaluateAnswerCompleteness(answer, intent)
    evaluationResults.push(completenessResult)

    // Calculate overall score
    const overallScore = this.calculateOverallScore(evaluationResults)

    // Determine if gates passed
    const requiredGatesPassed = evaluationResults
      .filter(result => this.getGateByName(result.gate)?.required)
      .every(result => result.passed)

    const optionalGatesScore = evaluationResults
      .filter(result => !this.getGateByName(result.gate)?.required)
      .reduce((avg, result) => avg + result.score, 0) /
      evaluationResults.filter(result => !this.getGateByName(result.gate)?.required).length

    const gatePassed = requiredGatesPassed && optionalGatesScore >= 0.6

    // Determine response permissions
    const allowedToRespond = gatePassed && !safetyResult.blockedResponse
    const fallbackRequired = !allowedToRespond && !safetyResult.blockedResponse

    // Generate improvement suggestions
    const improvementSuggestions = this.generateImprovementSuggestions(evaluationResults)

    // Calculate confidence adjustment
    const confidenceAdjustment = this.calculateConfidenceAdjustment(evaluationResults, overallScore)

    return {
      overallScore,
      gatePassed,
      evaluationResults,
      allowedToRespond,
      fallbackRequired,
      improvementSuggestions,
      confidenceAdjustment
    }
  }

  private static evaluateIntentRoutingAccuracy(
    intent: IntentClassificationV2,
    userMessage: string
  ): EvaluationResult {

    let score = intent.confidence
    const gate = this.getGateByName('intent_routing_accuracy')!
    let details = `Intent confidence: ${Math.round(intent.confidence * 100)}%`

    // Boost score if clarification needs are properly identified
    if (intent.clarificationNeeded && intent.suggestedQuestion) {
      score += 0.1
      details += `, Clarification properly identified`
    }

    // Boost score for good tag inference
    const tagCount = Object.values(intent.tags).filter(v => v).length
    if (tagCount >= 3) {
      score += 0.05
      details += `, Rich tag inference (${tagCount} tags)`
    }

    // Penalize if intent seems mismatched
    const messageWords = userMessage.toLowerCase().split(/\s+/)
    const themeWords = intent.primaryIntent.theme.toLowerCase().split(/\s+/)
    const overlap = messageWords.filter(word =>
      themeWords.some(themeWord => word.includes(themeWord) || themeWord.includes(word))
    ).length

    if (overlap === 0 && intent.confidence > 0.5) {
      score -= 0.2
      details += `, Possible theme mismatch`
    }

    score = Math.max(0, Math.min(1, score))

    return {
      gate: 'intent_routing_accuracy',
      passed: score >= gate.threshold,
      score,
      threshold: gate.threshold,
      details,
      recommendations: score < gate.threshold ? [
        'Improve intent classification accuracy',
        'Add more paraphrases for better matching',
        'Review canonical question categories'
      ] : []
    }
  }

  private static evaluateGroundedAnswerQuality(
    answer: GroundedAnswer,
    retrievalContext: HybridRetrievalContext
  ): EvaluationResult {

    const gate = this.getGateByName('grounded_answer_quality')!
    let score = 0.5 // Base score

    // Evaluate paragraph explanation quality
    const paragraphScore = this.evaluateParagraphQuality(answer.paragraphExplanation)
    score += paragraphScore * 0.3

    // Evaluate specific guidance quality
    const guidanceScore = answer.specificGuidance.length > 0 ? 0.2 : 0
    score += guidanceScore

    // Evaluate actionable steps
    const stepsScore = this.evaluateActionableSteps(answer.actionableSteps)
    score += stepsScore * 0.3

    // Evaluate grounding to retrieval results
    const groundingScore = this.evaluateGrounding(answer, retrievalContext.fusedResults)
    score += groundingScore * 0.2

    score = Math.max(0, Math.min(1, score))

    const details = `Paragraph: ${Math.round(paragraphScore * 100)}%, ` +
                   `Guidance: ${answer.specificGuidance.length} items, ` +
                   `Steps: ${answer.actionableSteps.length} actions, ` +
                   `Grounding: ${Math.round(groundingScore * 100)}%`

    return {
      gate: 'grounded_answer_quality',
      passed: score >= gate.threshold,
      score,
      threshold: gate.threshold,
      details,
      recommendations: score < gate.threshold ? [
        'Improve paragraph structure and clarity',
        'Add more specific guidance points',
        'Ensure better grounding to retrieved sources',
        'Make action steps more concrete and actionable'
      ] : []
    }
  }

  private static evaluateCitationAccuracy(
    citations: any[],
    retrievalContext: HybridRetrievalContext
  ): EvaluationResult {

    const gate = this.getGateByName('citation_accuracy')!
    let score = 0.5 // Base score

    // Check citation count
    if (citations.length >= 3) {
      score += 0.2
    } else if (citations.length >= 1) {
      score += 0.1
    }

    // Check citation diversity
    const sourceTypes = new Set(citations.map(c => c.type))
    if (sourceTypes.size >= 2) {
      score += 0.15
    }

    // Check relevance to retrieval results
    const topResultCitations = retrievalContext.fusedResults.slice(0, 5)
    const citationRelevance = citations.filter(citation =>
      topResultCitations.some(result =>
        result.title.toLowerCase().includes(citation.title.toLowerCase()) ||
        result.source.toLowerCase().includes(citation.source.toLowerCase())
      )
    ).length / Math.max(citations.length, 1)

    score += citationRelevance * 0.25

    // Check for required fields
    const completeCitations = citations.filter(c =>
      c.title && c.source && c.relevanceContext
    ).length / Math.max(citations.length, 1)

    score += completeCitations * 0.15

    score = Math.max(0, Math.min(1, score))

    const details = `Count: ${citations.length}, ` +
                   `Source types: ${sourceTypes.size}, ` +
                   `Relevance: ${Math.round(citationRelevance * 100)}%, ` +
                   `Complete: ${Math.round(completeCitations * 100)}%`

    return {
      gate: 'citation_accuracy',
      passed: score >= gate.threshold,
      score,
      threshold: gate.threshold,
      details,
      recommendations: score < gate.threshold ? [
        'Increase number of relevant citations',
        'Diversify citation source types',
        'Improve citation completeness',
        'Better align citations with retrieval results'
      ] : []
    }
  }

  private static evaluateSafetyCompliance(
    safetyResult: SafetyComplianceResult
  ): EvaluationResult {

    const gate = this.getGateByName('safety_compliance')!
    let score = 0.8 // Base score assuming general safety

    // Safety check results
    const criticalIssues = safetyResult.safetyChecks.filter(c =>
      c.triggered && c.severity === 'critical'
    ).length

    const highIssues = safetyResult.safetyChecks.filter(c =>
      c.triggered && c.severity === 'high'
    ).length

    // Penalize for safety issues
    score -= criticalIssues * 0.5
    score -= highIssues * 0.2

    // Compliance check results
    const nonCompliantChecks = safetyResult.complianceChecks.filter(c => !c.compliant).length
    score -= nonCompliantChecks * 0.1

    // Boost for required disclaimers
    if (safetyResult.requiredDisclaimers.length >= 2) {
      score += 0.1
    }

    score = Math.max(0, Math.min(1, score))

    const details = `Critical issues: ${criticalIssues}, ` +
                   `High issues: ${highIssues}, ` +
                   `Non-compliant: ${nonCompliantChecks}, ` +
                   `Disclaimers: ${safetyResult.requiredDisclaimers.length}`

    return {
      gate: 'safety_compliance',
      passed: score >= gate.threshold && !safetyResult.blockedResponse,
      score,
      threshold: gate.threshold,
      details,
      recommendations: score < gate.threshold ? [
        'Address critical safety issues',
        'Improve compliance with regulations',
        'Add appropriate disclaimers',
        'Review content for safety violations'
      ] : []
    }
  }

  private static evaluateAnswerCompleteness(
    answer: GroundedAnswer,
    intent: IntentClassificationV2
  ): EvaluationResult {

    const gate = this.getGateByName('answer_completeness')!
    let score = 0.5 // Base score

    // Check for paragraph explanation
    if (answer.paragraphExplanation && answer.paragraphExplanation.length > 50) {
      score += 0.2
    }

    // Check for specific guidance
    if (answer.specificGuidance.length >= 2) {
      score += 0.15
    }

    // Check for actionable steps
    if (answer.actionableSteps.length >= 3) {
      score += 0.2
    }

    // Check for appropriate disclaimers
    if (answer.disclaimers.length >= 2) {
      score += 0.1
    }

    // Check for clarification handling
    if (answer.requiresClarification && answer.clarificationQuestions?.length) {
      score += 0.1
    } else if (!answer.requiresClarification) {
      score += 0.1
    }

    // Check theme-specific completeness
    const theme = intent.primaryIntent.theme
    if (theme.includes('Appeals') && answer.actionableSteps.some(step => step.includes('appeal'))) {
      score += 0.05
    }
    if (theme.includes('Billing') && answer.actionableSteps.some(step => step.includes('bill'))) {
      score += 0.05
    }

    score = Math.max(0, Math.min(1, score))

    const details = `Paragraph: ${!!answer.paragraphExplanation}, ` +
                   `Guidance: ${answer.specificGuidance.length}, ` +
                   `Steps: ${answer.actionableSteps.length}, ` +
                   `Disclaimers: ${answer.disclaimers.length}`

    return {
      gate: 'answer_completeness',
      passed: score >= gate.threshold,
      score,
      threshold: gate.threshold,
      details,
      recommendations: score < gate.threshold ? [
        'Add more comprehensive explanation',
        'Include additional specific guidance',
        'Provide more actionable steps',
        'Add appropriate disclaimers'
      ] : []
    }
  }

  private static evaluateParagraphQuality(paragraph: string): number {
    let score = 0.3 // Base score

    // Length check
    if (paragraph.length >= 100 && paragraph.length <= 400) {
      score += 0.2
    }

    // Structure check
    if (paragraph.includes('Based on') || paragraph.includes('This means')) {
      score += 0.1
    }

    // Sentence count
    const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 0)
    if (sentences.length >= 2 && sentences.length <= 5) {
      score += 0.15
    }

    // Plain language check (rough estimate)
    const complexWords = paragraph.match(/\b\w{7,}\b/g)?.length || 0
    const totalWords = paragraph.split(/\s+/).length
    const complexRatio = complexWords / totalWords

    if (complexRatio < 0.3) {
      score += 0.1
    }

    // Readability indicators
    if (paragraph.includes('you') || paragraph.includes('your')) {
      score += 0.05 // Personal, direct language
    }

    return Math.max(0, Math.min(1, score))
  }

  private static evaluateActionableSteps(steps: string[]): number {
    let score = 0.2 // Base score

    // Step count
    if (steps.length >= 3) {
      score += 0.3
    } else if (steps.length >= 1) {
      score += 0.15
    }

    // Action words
    const actionWords = ['contact', 'request', 'gather', 'file', 'call', 'ask', 'verify']
    const actionSteps = steps.filter(step =>
      actionWords.some(word => step.toLowerCase().includes(word))
    ).length

    score += (actionSteps / Math.max(steps.length, 1)) * 0.3

    // Specificity
    const specificSteps = steps.filter(step =>
      step.length > 30 && (step.includes('your') || step.includes('the'))
    ).length

    score += (specificSteps / Math.max(steps.length, 1)) * 0.2

    return Math.max(0, Math.min(1, score))
  }

  private static evaluateGrounding(answer: GroundedAnswer, retrievalResults: any[]): number {
    let score = 0.3 // Base score

    const answerText = answer.paragraphExplanation + ' ' + answer.specificGuidance.join(' ')

    // Check for references to retrieval results
    const groundedReferences = retrievalResults.filter(result =>
      answerText.toLowerCase().includes(result.title.toLowerCase().substring(0, 20)) ||
      result.content.split(' ').slice(0, 5).some((word: string) =>
        answerText.toLowerCase().includes(word.toLowerCase()) && word.length > 4
      )
    ).length

    score += (groundedReferences / Math.max(retrievalResults.length, 1)) * 0.4

    // Check for regulatory references
    const regulations = ['ACA', 'ERISA', 'No Surprises Act', 'HIPAA']
    const regulatoryRefs = regulations.filter(reg =>
      answerText.includes(reg)
    ).length

    if (regulatoryRefs > 0) {
      score += 0.2
    }

    // Check for specific guidance grounding
    const specificTerms = answer.specificGuidance.filter(guidance =>
      retrievalResults.some(result =>
        result.content.toLowerCase().includes(guidance.toLowerCase().substring(0, 15))
      )
    ).length

    score += (specificTerms / Math.max(answer.specificGuidance.length, 1)) * 0.1

    return Math.max(0, Math.min(1, score))
  }

  private static calculateOverallScore(evaluationResults: EvaluationResult[]): number {
    let weightedScore = 0
    let totalWeight = 0

    evaluationResults.forEach(result => {
      const gate = this.getGateByName(result.gate)
      if (gate) {
        weightedScore += result.score * gate.weight
        totalWeight += gate.weight
      }
    })

    return totalWeight > 0 ? weightedScore / totalWeight : 0
  }

  private static generateImprovementSuggestions(evaluationResults: EvaluationResult[]): string[] {
    const suggestions: string[] = []

    evaluationResults.forEach(result => {
      if (!result.passed) {
        suggestions.push(...result.recommendations)
      }
    })

    // Remove duplicates and return top suggestions
    return Array.from(new Set(suggestions)).slice(0, 5)
  }

  private static calculateConfidenceAdjustment(
    evaluationResults: EvaluationResult[],
    overallScore: number
  ): number {
    // Positive adjustment for high-quality responses
    if (overallScore >= 0.9) {
      return 0.1
    } else if (overallScore >= 0.8) {
      return 0.05
    } else if (overallScore >= 0.7) {
      return 0
    } else if (overallScore >= 0.6) {
      return -0.05
    } else {
      return -0.1
    }
  }

  private static getGateByName(name: string): EvaluationGate | undefined {
    return this.evaluationGates.find(gate => gate.name === name)
  }

  // Public utility methods
  static setFeatureFlag(flag: keyof FeatureFlags, enabled: boolean): void {
    this.featureFlags[flag] = enabled
    console.log(`🚩 Feature flag ${flag} set to ${enabled}`)
  }

  static getFeatureFlags(): FeatureFlags {
    return { ...this.featureFlags }
  }

  static addCustomGate(gate: EvaluationGate): void {
    this.evaluationGates.push(gate)
    console.log(`🚪 Added custom evaluation gate: ${gate.name}`)
  }

  static updateGateThreshold(gateName: string, newThreshold: number): void {
    const gate = this.getGateByName(gateName)
    if (gate) {
      gate.threshold = newThreshold
      console.log(`🎯 Updated ${gateName} threshold to ${newThreshold}`)
    }
  }

  static evaluateOffline(
    testCases: Array<{
      answer: GroundedAnswer
      intent: IntentClassificationV2
      retrievalContext: HybridRetrievalContext
      safetyResult: SafetyComplianceResult
      userMessage: string
      expectedScore?: number
    }>
  ): Array<{ testCase: number; assessment: QualityAssessment; passed: boolean }> {

    console.log(`🧪 Running offline evaluation on ${testCases.length} test cases`)

    return testCases.map((testCase, index) => {
      const assessment = this.evaluateResponse(
        testCase.answer,
        testCase.intent,
        testCase.retrievalContext,
        testCase.safetyResult,
        testCase.userMessage
      )

      const passed = testCase.expectedScore ?
        assessment.overallScore >= testCase.expectedScore :
        assessment.gatePassed

      return {
        testCase: index + 1,
        assessment,
        passed
      }
    })
  }
}