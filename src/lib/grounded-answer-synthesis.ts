import { HybridRetrievalContext, RetrievalResult } from './hybrid-retrieval'
import { IntentClassificationV2 } from './canonical-intent-classifier'

export interface GroundedAnswer {
  paragraphExplanation: string
  specificGuidance: string[]
  actionableSteps: string[]
  citations: WyngCitation[]
  confidenceScore: number
  requiresClarification: boolean
  clarificationQuestions?: string[]
  disclaimers: string[]
}

export interface WyngCitation {
  id: string
  type: 'law' | 'policy' | 'wyng_knowledge' | 'plan_document' | 'regulatory'
  title: string
  source: string
  relevanceContext: string
  excerpt?: string
  url?: string
  effectiveDate?: string
  jurisdiction?: string
}

export class GroundedAnswerSynthesis {
  private static readonly CONFIDENCE_THRESHOLDS = {
    HIGH: 0.8,
    MEDIUM: 0.6,
    LOW: 0.3
  }

  private static readonly PARAGRAPH_TEMPLATE = {
    opener: "Based on your {document_type} and {intent_theme} question,",
    explanation: "{main_explanation}",
    context: "This situation involves {key_regulations} which {regulatory_context}.",
    outcome: "Here's what this means for you: {practical_outcome}"
  }

  static synthesizeGroundedAnswer(
    retrievalContext: HybridRetrievalContext,
    userMessage: string,
    uploadedDocuments: any[] = []
  ): GroundedAnswer {

    console.log('🧠 Starting grounded answer synthesis')
    console.log(`   📊 Fusion results: ${retrievalContext.fusedResults.length}`)
    console.log(`   🎯 Intent confidence: ${retrievalContext.intentContext.confidence}`)
    console.log(`   🌍 Jurisdiction: ${retrievalContext.jurisdiction.state}`)

    // Step 1: Generate paragraph-first explanation
    const paragraphExplanation = this.generateParagraphExplanation(
      retrievalContext,
      userMessage,
      uploadedDocuments
    )

    // Step 2: Extract specific guidance from top results
    const specificGuidance = this.extractSpecificGuidance(
      retrievalContext.fusedResults.slice(0, 5)
    )

    // Step 3: Generate actionable steps
    const actionableSteps = this.generateActionableSteps(
      retrievalContext,
      userMessage
    )

    // Step 4: Create properly formatted citations
    const citations = this.createWyngCitations(retrievalContext.fusedResults)

    // Step 5: Calculate overall confidence
    const confidenceScore = this.calculateOverallConfidence(retrievalContext)

    // Step 6: Determine if clarification is needed
    const { requiresClarification, clarificationQuestions } = this.assessClarificationNeeds(
      retrievalContext,
      confidenceScore
    )

    // Step 7: Generate appropriate disclaimers
    const disclaimers = this.generateDisclaimers(retrievalContext, confidenceScore)

    return {
      paragraphExplanation,
      specificGuidance,
      actionableSteps,
      citations,
      confidenceScore,
      requiresClarification,
      clarificationQuestions,
      disclaimers
    }
  }

  private static generateParagraphExplanation(
    retrievalContext: HybridRetrievalContext,
    userMessage: string,
    uploadedDocuments: any[]
  ): string {

    const intent = retrievalContext.intentContext
    const topResults = retrievalContext.fusedResults.slice(0, 3)

    // Determine document context
    let documentType = 'question'
    if (uploadedDocuments.length > 0) {
      if (userMessage.toLowerCase().includes('eob') ||
          topResults.some(r => r.content.toLowerCase().includes('explanation of benefits'))) {
        documentType = 'EOB (Explanation of Benefits)'
      } else if (userMessage.toLowerCase().includes('bill') ||
                 topResults.some(r => r.content.toLowerCase().includes('medical bill'))) {
        documentType = 'medical bill'
      } else if (userMessage.toLowerCase().includes('denial') ||
                 topResults.some(r => r.content.toLowerCase().includes('denial'))) {
        documentType = 'denial letter'
      } else {
        documentType = 'healthcare document'
      }
    }

    // Extract key regulations from top results
    const keyRegulations = this.extractKeyRegulations(topResults, retrievalContext.jurisdiction)

    // Generate main explanation based on intent and results
    const mainExplanation = this.generateMainExplanation(intent, topResults, userMessage)

    // Provide regulatory context
    const regulatoryContext = this.generateRegulatoryContext(keyRegulations, retrievalContext.jurisdiction)

    // Determine practical outcome
    const practicalOutcome = this.generatePracticalOutcome(intent, topResults, keyRegulations)

    // Build paragraph using template
    const opener = this.PARAGRAPH_TEMPLATE.opener
      .replace('{document_type}', documentType)
      .replace('{intent_theme}', intent.primaryIntent.theme.toLowerCase())

    const explanation = this.PARAGRAPH_TEMPLATE.explanation
      .replace('{main_explanation}', mainExplanation)

    const context = keyRegulations.length > 0 ?
      this.PARAGRAPH_TEMPLATE.context
        .replace('{key_regulations}', keyRegulations.join(', '))
        .replace('{regulatory_context}', regulatoryContext) : ''

    const outcome = this.PARAGRAPH_TEMPLATE.outcome
      .replace('{practical_outcome}', practicalOutcome)

    // Combine into coherent paragraph
    const paragraphParts = [opener, explanation, context, outcome].filter(part => part.length > 0)
    return paragraphParts.join(' ')
  }

  private static extractKeyRegulations(
    topResults: RetrievalResult[],
    jurisdiction: any
  ): string[] {
    const regulations = new Set<string>()

    // Add jurisdiction-specific regulations
    if (jurisdiction.regulations) {
      jurisdiction.regulations.forEach((reg: string) => regulations.add(reg))
    }

    // Extract regulations mentioned in top results
    topResults.forEach(result => {
      if (result.source === 'law') {
        // Extract regulation names from law titles and content
        const regulationPatterns = [
          /ACA|Affordable Care Act/gi,
          /ERISA/gi,
          /HIPAA/gi,
          /No Surprises Act|NSA/gi,
          /Consolidated Appropriations Act|CAA/gi,
          /Emergency Medical Treatment and Labor Act|EMTALA/gi
        ]

        regulationPatterns.forEach(pattern => {
          const matches = (result.title + ' ' + result.content).match(pattern)
          if (matches) {
            matches.forEach(match => regulations.add(match))
          }
        })
      }
    })

    return Array.from(regulations).slice(0, 3) // Limit to top 3 most relevant
  }

  private static generateMainExplanation(
    intent: IntentClassificationV2,
    topResults: RetrievalResult[],
    userMessage: string
  ): string {

    const primaryIntent = intent.primaryIntent

    // Generate explanation based on intent theme
    switch (primaryIntent.theme) {
      case 'Claims, Billing, EOBs & Appeals':
        if (userMessage.toLowerCase().includes('denied') ||
            topResults.some(r => r.content.toLowerCase().includes('appeal'))) {
          return "your claim appears to have been denied, which means your insurance company has decided not to cover this service or has questions about its medical necessity"
        } else if (userMessage.toLowerCase().includes('eob')) {
          return "your EOB shows the breakdown of what your insurance paid and what you're responsible for paying"
        } else {
          return "there appears to be a billing issue or question about what you're being charged for medical services"
        }

      case 'Costs: Premiums, Deductibles, Copays, Coinsurance, OOP Max':
        return "understanding your insurance cost-sharing helps you know exactly what you should pay for medical services"

      case 'Networks & Access':
        if (userMessage.toLowerCase().includes('out of network') ||
            userMessage.toLowerCase().includes('balance bill')) {
          return "you may have received care from an out-of-network provider, which can result in higher costs or balance billing"
        } else {
          return "this involves questions about which providers are covered by your insurance plan"
        }

      case 'Prescriptions & Pharmacy':
        return "your prescription coverage depends on your plan's formulary and the specific tier your medication is placed in"

      case 'Enrollment & Switching':
        return "you have specific time periods and qualifying events that allow you to enroll in or change your health insurance"

      default:
        return "this situation requires understanding your specific insurance benefits and the applicable healthcare regulations"
    }
  }

  private static generateRegulatoryContext(
    keyRegulations: string[],
    jurisdiction: any
  ): string {

    if (keyRegulations.length === 0) {
      return "provide basic consumer protections under federal health insurance law"
    }

    const regulationContexts = new Map([
      ['ACA', 'requires essential health benefits and preventive care coverage'],
      ['Affordable Care Act', 'requires essential health benefits and preventive care coverage'],
      ['ERISA', 'governs employer-sponsored health plans and provides appeal rights'],
      ['No Surprises Act', 'protects you from unexpected medical bills'],
      ['NSA', 'protects you from unexpected medical bills'],
      ['HIPAA', 'provides privacy protections and some insurance continuity rights'],
      ['CAA', 'enhanced surprise billing protections and mental health parity'],
      ['EMTALA', 'requires emergency medical screening and stabilization']
    ])

    const contexts = keyRegulations
      .map(reg => regulationContexts.get(reg))
      .filter(context => context)

    if (contexts.length === 0) {
      return `apply in ${jurisdiction.state === 'federal' ? 'all states' : jurisdiction.state} to protect your rights`
    }

    if (contexts.length === 1) {
      return contexts[0]
    } else {
      const lastContext = contexts.pop()
      return `${contexts.join(', ')}, and ${lastContext}`
    }
  }

  private static generatePracticalOutcome(
    intent: IntentClassificationV2,
    topResults: RetrievalResult[],
    keyRegulations: string[]
  ): string {

    const theme = intent.primaryIntent.theme

    if (theme.includes('Appeals') ||
        topResults.some(r => r.content.toLowerCase().includes('denial'))) {
      return "you have the right to appeal this decision and should receive a detailed explanation of the denial reason"
    }

    if (theme.includes('Costs') || theme.includes('Billing')) {
      return "you should only pay what's required under your plan's cost-sharing structure"
    }

    if (keyRegulations.includes('No Surprises Act') || keyRegulations.includes('NSA')) {
      return "you may be protected from unexpected charges and can dispute bills that violate balance billing rules"
    }

    if (theme.includes('Networks')) {
      return "you should verify provider network status before receiving care to avoid unexpected costs"
    }

    if (theme.includes('Enrollment')) {
      return "you need to act within specific time windows to make changes to your coverage"
    }

    return "you have rights and options to resolve this situation through proper channels"
  }

  private static extractSpecificGuidance(topResults: RetrievalResult[]): string[] {
    const guidance: string[] = []

    topResults.forEach(result => {
      // Extract actionable guidance from each result
      const content = result.content

      // Look for specific guidance patterns
      if (content.includes('must') || content.includes('required')) {
        const sentences = content.split(/[.!?]+/)
        sentences.forEach(sentence => {
          if ((sentence.includes('must') || sentence.includes('required')) &&
              sentence.length > 20 && sentence.length < 200) {
            guidance.push(sentence.trim())
          }
        })
      }

      // Extract regulatory requirements
      if (result.source === 'law' && content.includes('shall')) {
        const sentences = content.split(/[.!?]+/)
        sentences.forEach(sentence => {
          if (sentence.includes('shall') && sentence.length > 20 && sentence.length < 200) {
            guidance.push(sentence.trim())
          }
        })
      }

      // Extract policy-specific guidance
      if (result.source === 'policy') {
        const sentences = content.split(/[.!?]+/)
        sentences.forEach(sentence => {
          if ((sentence.includes('coverage') || sentence.includes('benefit') ||
               sentence.includes('covered') || sentence.includes('eligible')) &&
              sentence.length > 20 && sentence.length < 200) {
            guidance.push(sentence.trim())
          }
        })
      }
    })

    // Remove duplicates and return top guidance
    return Array.from(new Set(guidance)).slice(0, 5)
  }

  private static generateActionableSteps(
    retrievalContext: HybridRetrievalContext,
    userMessage: string
  ): string[] {

    const intent = retrievalContext.intentContext
    const steps: string[] = []

    // Universal first step - always gather documentation
    steps.push("Gather all relevant documentation including your EOB, medical bills, insurance card, and any correspondence")

    // Intent-specific steps
    const theme = intent.primaryIntent.theme

    if (theme.includes('Appeals') || userMessage.toLowerCase().includes('denied')) {
      steps.push("Request a complete copy of your denial letter with specific denial reasons")
      steps.push("Contact your healthcare provider to obtain supporting medical records")
      steps.push("File an internal appeal with your insurance company within the required timeframe")
    } else if (theme.includes('Billing') || userMessage.toLowerCase().includes('bill')) {
      steps.push("Contact your insurance company to verify what should be covered")
      steps.push("Request an itemized bill from your healthcare provider")
      steps.push("Compare the bill against your EOB to identify any discrepancies")
    } else if (theme.includes('Networks') || userMessage.toLowerCase().includes('out of network')) {
      steps.push("Verify the provider's network status with your insurance company")
      steps.push("Check if you have out-of-network benefits or if an exception can be made")
      steps.push("Review if the situation qualifies for No Surprises Act protection")
    } else if (theme.includes('Costs')) {
      steps.push("Review your Summary of Benefits and Coverage (SBC) for cost-sharing details")
      steps.push("Contact your insurance company to confirm your current deductible and out-of-pocket status")
    } else if (theme.includes('Enrollment')) {
      steps.push("Check if you qualify for a Special Enrollment Period due to a life event")
      steps.push("Review available plans during the next Open Enrollment period")
    } else {
      steps.push("Contact your insurance company's customer service for specific guidance")
      steps.push("Consider consulting with a patient advocate if the issue is complex")
    }

    // Universal final steps
    steps.push("Document all phone calls and correspondence with dates, names, and reference numbers")
    steps.push("Set calendar reminders for any deadlines or follow-up actions")

    return steps
  }

  private static createWyngCitations(fusedResults: RetrievalResult[]): WyngCitation[] {
    const citations: WyngCitation[] = []

    fusedResults.slice(0, 8).forEach((result, index) => {
      const citation: WyngCitation = {
        id: `cite_${index + 1}`,
        type: result.source === 'law' ? 'law' :
              result.source === 'policy' ? 'policy' :
              result.source === 'wyng' ? 'wyng_knowledge' : 'regulatory',
        title: result.title,
        source: result.citation,
        relevanceContext: this.generateRelevanceContext(result),
        excerpt: result.content.length > 200 ?
                 result.content.substring(0, 200) + '...' :
                 result.content,
        jurisdiction: result.metadata.jurisdiction
      }

      // Add URLs for specific citation types
      if (result.source === 'law' && result.citation.includes('CFR')) {
        citation.url = this.generateCFRUrl(result.citation)
      } else if (result.source === 'wyng') {
        citation.url = 'https://wyng.health/knowledge'
      }

      citations.push(citation)
    })

    return citations
  }

  private static generateRelevanceContext(result: RetrievalResult): string {
    const score = Math.round(result.finalScore * 100)
    const jurisdictionMatch = result.jurisdictionBoost > 0.2 ? 'jurisdiction-specific' : 'general'
    const intentMatch = result.intentMatchScore > 0.2 ? 'highly relevant' : 'contextually relevant'

    return `${score}% relevance, ${jurisdictionMatch}, ${intentMatch} to your situation`
  }

  private static generateCFRUrl(citation: string): string {
    // Extract CFR reference and build eCFR URL
    const cfrMatch = citation.match(/(\d+)\s*CFR\s*(\d+)\.(\d+)/i)
    if (cfrMatch) {
      const [, title, part, section] = cfrMatch
      return `https://www.ecfr.gov/current/title-${title}/part-${part}/section-${part}.${section}`
    }
    return 'https://www.ecfr.gov'
  }

  private static calculateOverallConfidence(retrievalContext: HybridRetrievalContext): number {
    let confidence = retrievalContext.intentContext.confidence * 0.4 // Base intent confidence

    // Factor in retrieval quality
    if (retrievalContext.fusedResults.length > 0) {
      const avgRetrievalScore = retrievalContext.fusedResults.slice(0, 5)
        .reduce((sum, result) => sum + result.finalScore, 0) /
        Math.min(retrievalContext.fusedResults.length, 5)
      confidence += avgRetrievalScore * 0.3
    }

    // Factor in jurisdiction confidence
    confidence += (retrievalContext.jurisdiction.priority / 10) * 0.1

    // Factor in source diversity
    const sourceTypes = new Set(retrievalContext.fusedResults.map(r => r.source))
    if (sourceTypes.size >= 2) {
      confidence += 0.1
    }

    // Factor in citation quality
    const lawResults = retrievalContext.fusedResults.filter(r => r.source === 'law')
    if (lawResults.length >= 2) {
      confidence += 0.1
    }

    return Math.min(confidence, 1.0)
  }

  private static assessClarificationNeeds(
    retrievalContext: HybridRetrievalContext,
    confidenceScore: number
  ): { requiresClarification: boolean; clarificationQuestions?: string[] } {

    const intent = retrievalContext.intentContext

    // High confidence - no clarification needed
    if (confidenceScore >= this.CONFIDENCE_THRESHOLDS.HIGH) {
      return { requiresClarification: false }
    }

    // Check intent-specific clarification needs
    if (intent.clarificationNeeded || confidenceScore < this.CONFIDENCE_THRESHOLDS.MEDIUM) {
      const questions: string[] = []

      // Use suggested question from intent classification
      if (intent.suggestedQuestion) {
        questions.push(intent.suggestedQuestion)
      }

      // Add context-specific questions based on intent
      const theme = intent.primaryIntent.theme
      if (theme.includes('Costs') && !intent.tags.productLine) {
        questions.push("What type of insurance plan do you have (employer, Marketplace, Medicaid, etc.)?")
      }

      if (theme.includes('Networks') && !retrievalContext.jurisdiction.state) {
        questions.push("What state are you located in for state-specific insurance regulations?")
      }

      if (intent.primaryIntent.needsDocuments && retrievalContext.fusedResults.length === 0) {
        questions.push("Could you upload your medical bill, EOB, or other relevant documents?")
      }

      if (theme.includes('Appeals') && confidenceScore < this.CONFIDENCE_THRESHOLDS.MEDIUM) {
        questions.push("What specific reason did your insurance company give for denying your claim?")
      }

      return {
        requiresClarification: true,
        clarificationQuestions: questions.slice(0, 3) // Limit to 3 questions
      }
    }

    return { requiresClarification: false }
  }

  private static generateDisclaimers(
    retrievalContext: HybridRetrievalContext,
    confidenceScore: number
  ): string[] {

    const disclaimers: string[] = []

    // Universal disclaimer
    disclaimers.push("This guidance is for informational purposes only and should not be considered legal or medical advice.")

    // Confidence-based disclaimers
    if (confidenceScore < this.CONFIDENCE_THRESHOLDS.HIGH) {
      disclaimers.push("Please verify this information with your insurance company and healthcare providers.")
    }

    if (confidenceScore < this.CONFIDENCE_THRESHOLDS.MEDIUM) {
      disclaimers.push("Consider consulting with a patient advocate or healthcare navigator for personalized assistance.")
    }

    // Intent-specific disclaimers
    const theme = retrievalContext.intentContext.primaryIntent.theme
    if (theme.includes('Appeals')) {
      disclaimers.push("Appeal deadlines are strict - contact your insurance company immediately to confirm timeframes.")
    }

    if (theme.includes('Legal') || theme.includes('ERISA')) {
      disclaimers.push("Complex legal situations may require consultation with an attorney specializing in healthcare law.")
    }

    // Jurisdiction disclaimers
    if (retrievalContext.jurisdiction.state !== 'federal') {
      disclaimers.push(`This guidance includes ${retrievalContext.jurisdiction.state}-specific regulations that may not apply in other states.`)
    }

    return disclaimers
  }

  // Public evaluation method
  static evaluateAnswerQuality(
    answer: GroundedAnswer,
    expectedOutcome: string,
    expectedCitations: number
  ): {
    paragraphQuality: number
    citationAccuracy: number
    actionabilityScore: number
    overallScore: number
  } {

    // Evaluate paragraph explanation quality
    const paragraphQuality = this.evaluateParagraphQuality(answer.paragraphExplanation)

    // Evaluate citation accuracy
    const citationAccuracy = Math.min(answer.citations.length / expectedCitations, 1.0)

    // Evaluate actionability
    const actionabilityScore = this.evaluateActionability(answer.actionableSteps)

    // Calculate overall score
    const overallScore = (
      paragraphQuality * 0.4 +
      citationAccuracy * 0.3 +
      actionabilityScore * 0.3
    )

    return {
      paragraphQuality,
      citationAccuracy,
      actionabilityScore,
      overallScore
    }
  }

  private static evaluateParagraphQuality(paragraph: string): number {
    let score = 0.5 // Base score

    // Check for paragraph structure
    if (paragraph.length > 100 && paragraph.length < 500) score += 0.2
    if (paragraph.includes('Based on')) score += 0.1
    if (paragraph.includes('This means')) score += 0.1
    if (paragraph.split('.').length >= 3) score += 0.1 // Multiple sentences

    return Math.min(score, 1.0)
  }

  private static evaluateActionability(steps: string[]): number {
    let score = 0

    // Base score for having steps
    if (steps.length > 0) score += 0.3

    // Score for specific, actionable language
    steps.forEach(step => {
      if (step.includes('Contact') || step.includes('Request') ||
          step.includes('Gather') || step.includes('File')) {
        score += 0.1
      }
    })

    return Math.min(score, 1.0)
  }
}