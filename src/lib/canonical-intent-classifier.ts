import canonicalQuestions from '../../data/chat_corpus/canonical_questions.json'

export interface CanonicalIntent {
  id: string
  theme: string
  question: string
  paraphrases: string[]
  tags: {
    jurisdiction?: string[] // state codes, 'federal', 'all'
    productLine?: ('Individual' | 'Employer' | 'COBRA' | 'Medicaid' | 'CHIP' | 'Medicare')[]
    artifactType?: ('EOB' | 'Bill' | 'SBC' | 'Denial' | 'Prior_Auth' | 'Appeal')[]
    lifecycle?: ('enroll' | 'use' | 'appeal' | 'claim')[]
    careType?: ('preventive' | 'emergency' | 'specialty' | 'pharmacy' | 'mental_health')[]
  }
  confidence?: number
  needsDocuments?: boolean
  needsPlanInfo?: boolean
}

export interface IntentClassificationV2 {
  primaryIntent: CanonicalIntent
  secondaryIntents: CanonicalIntent[]
  confidence: number
  clarificationNeeded: boolean
  suggestedQuestion?: string
  tags: {
    jurisdiction?: string
    productLine?: string
    artifactType?: string[]
    lifecycle?: string
    urgency?: 'low' | 'medium' | 'high'
  }
}

export class CanonicalIntentClassifier {
  private static intents: CanonicalIntent[] = []
  private static paraphraseMap: Map<string, string[]> = new Map()

  static initialize(): void {
    console.log('🚀 Initializing Canonical Intent Classifier')

    this.intents = []
    this.paraphraseMap.clear()

    canonicalQuestions.categories.forEach((category, categoryIndex) => {
      category.questions.forEach((question, questionIndex) => {
        const intentId = `${category.theme.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${questionIndex}`

        const paraphrases = this.generateParaphrases(question, category.theme)
        const tags = this.inferTags(question, category.theme)

        const intent: CanonicalIntent = {
          id: intentId,
          theme: category.theme,
          question,
          paraphrases,
          tags,
          needsDocuments: this.determineDocumentNeeds(question, category.theme),
          needsPlanInfo: this.determinePlanInfoNeeds(question, category.theme)
        }

        this.intents.push(intent)
        this.paraphraseMap.set(intentId, paraphrases)
      })
    })

    console.log(`✅ Loaded ${this.intents.length} canonical intents with paraphrases`)
  }

  private static generateParaphrases(question: string, theme: string): string[] {
    const paraphrases: string[] = []

    // Base variations
    paraphrases.push(question)
    paraphrases.push(question.toLowerCase())
    paraphrases.push(question.replace(/[?]/g, ''))

    // Theme-specific paraphrases
    switch (theme) {
      case 'Enrollment & Switching':
        if (question.includes('Open Enrollment')) {
          paraphrases.push('when can I enroll', 'enrollment period', 'when does enrollment start')
        }
        if (question.includes('Qualifying Life Event')) {
          paraphrases.push('life event enrollment', 'special enrollment', 'QLE', 'when can I change plans')
        }
        break

      case 'Costs: Premiums, Deductibles, Copays, Coinsurance, OOP Max':
        if (question.includes('deductible')) {
          paraphrases.push('what is my deductible', 'how much is my deductible', 'deductible amount')
        }
        if (question.includes('copay')) {
          paraphrases.push('what is a copay', 'copayment', 'how much do I pay')
        }
        if (question.includes('coinsurance')) {
          paraphrases.push('what is coinsurance', 'percentage I pay', 'cost sharing')
        }
        break

      case 'Claims, Billing, EOBs & Appeals':
        if (question.includes('EOB')) {
          paraphrases.push('explanation of benefits', 'insurance statement', 'claim summary')
        }
        if (question.includes('appeal')) {
          paraphrases.push('dispute claim', 'fight denial', 'challenge decision')
        }
        if (question.includes('balance-billed')) {
          paraphrases.push('surprise bill', 'balance billing', 'unexpected charges')
        }
        break

      case 'Networks & Access':
        if (question.includes('in-network')) {
          paraphrases.push('covered doctor', 'network provider', 'participating provider')
        }
        if (question.includes('out-of-network')) {
          paraphrases.push('non-participating', 'not covered', 'OON provider')
        }
        break

      case 'Prescriptions & Pharmacy':
        if (question.includes('formulary')) {
          paraphrases.push('covered drugs', 'drug list', 'medication coverage')
        }
        if (question.includes('prior authorization')) {
          paraphrases.push('prior auth', 'PA required', 'pre-approval')
        }
        break
    }

    // Common question variations
    if (question.includes('How do I')) {
      paraphrases.push(question.replace('How do I', 'How can I'))
      paraphrases.push(question.replace('How do I', 'What do I need to do to'))
    }

    if (question.includes('What')) {
      paraphrases.push(question.replace('What', 'Can you explain what'))
    }

    if (question.includes('Can I')) {
      paraphrases.push(question.replace('Can I', 'Am I able to'))
      paraphrases.push(question.replace('Can I', 'Is it possible to'))
    }

    // Remove duplicates and return
    return Array.from(new Set(paraphrases))
  }

  private static inferTags(question: string, theme: string): CanonicalIntent['tags'] {
    const tags: CanonicalIntent['tags'] = {}

    // Product line inference
    if (question.includes('employer') || question.includes('job')) {
      tags.productLine = ['Employer']
    } else if (question.includes('COBRA')) {
      tags.productLine = ['COBRA']
    } else if (question.includes('Medicaid')) {
      tags.productLine = ['Medicaid']
    } else if (question.includes('Medicare')) {
      tags.productLine = ['Medicare']
    } else if (question.includes('Marketplace') || question.includes('individual plan')) {
      tags.productLine = ['Individual']
    }

    // Artifact type inference
    if (question.includes('EOB') || question.includes('Explanation of Benefits')) {
      tags.artifactType = ['EOB']
    }
    if (question.includes('bill') || question.includes('billing')) {
      tags.artifactType = (tags.artifactType || []).concat(['Bill'])
    }
    if (question.includes('deny') || question.includes('denial')) {
      tags.artifactType = (tags.artifactType || []).concat(['Denial'])
    }
    if (question.includes('appeal')) {
      tags.artifactType = (tags.artifactType || []).concat(['Appeal'])
    }
    if (question.includes('SBC') || question.includes('Summary of Benefits')) {
      tags.artifactType = (tags.artifactType || []).concat(['SBC'])
    }

    // Lifecycle inference
    if (theme.includes('Enrollment') || question.includes('enroll')) {
      tags.lifecycle = ['enroll']
    } else if (theme.includes('Claims') || theme.includes('Appeals')) {
      tags.lifecycle = ['claim', 'appeal']
    } else if (theme.includes('Using Your Plan')) {
      tags.lifecycle = ['use']
    }

    // Care type inference
    if (question.includes('preventive') || question.includes('wellness')) {
      tags.careType = ['preventive']
    }
    if (question.includes('emergency') || question.includes('ER')) {
      tags.careType = ['emergency']
    }
    if (question.includes('mental health') || question.includes('therapy')) {
      tags.careType = ['mental_health']
    }
    if (question.includes('prescription') || question.includes('pharmacy')) {
      tags.careType = ['pharmacy']
    }
    if (question.includes('specialist')) {
      tags.careType = ['specialty']
    }

    // Jurisdiction defaults to federal unless state-specific
    tags.jurisdiction = ['federal']

    return tags
  }

  private static determineDocumentNeeds(question: string, theme: string): boolean {
    // Questions that typically require documents
    const documentIndicators = [
      'EOB', 'bill', 'claim', 'denial', 'appeal', 'statement',
      'charged', 'billed', 'amount', 'cost', 'pay'
    ]

    const needsDocumentThemes = [
      'Claims, Billing, EOBs & Appeals',
      'Understanding Tricky Benefit Language',
      'Big Unexpected Bills & Financial Hardship'
    ]

    return documentIndicators.some(indicator =>
      question.toLowerCase().includes(indicator.toLowerCase())
    ) || needsDocumentThemes.includes(theme)
  }

  private static determinePlanInfoNeeds(question: string, theme: string): boolean {
    // Questions that typically require plan information
    const planIndicators = [
      'deductible', 'copay', 'coinsurance', 'coverage', 'network',
      'formulary', 'tier', 'prior auth', 'referral'
    ]

    const needsPlanThemes = [
      'Plan Types & Choosing',
      'Costs: Premiums, Deductibles, Copays, Coinsurance, OOP Max',
      'Networks & Access',
      'Prescriptions & Pharmacy'
    ]

    return planIndicators.some(indicator =>
      question.toLowerCase().includes(indicator.toLowerCase())
    ) || needsPlanThemes.includes(theme)
  }

  static classifyIntent(
    userMessage: string,
    uploadedDocuments: any[] = [],
    userLocation?: string,
    productContext?: string
  ): IntentClassificationV2 {
    if (this.intents.length === 0) {
      this.initialize()
    }

    const normalizedMessage = userMessage.toLowerCase().trim()

    // Score all intents
    const scores: { intent: CanonicalIntent; score: number }[] = []

    for (const intent of this.intents) {
      let score = 0

      // Direct question matching
      if (normalizedMessage.includes(intent.question.toLowerCase())) {
        score += 10
      }

      // Paraphrase matching
      for (const paraphrase of intent.paraphrases) {
        if (normalizedMessage.includes(paraphrase.toLowerCase())) {
          score += 5
        }
      }

      // Keyword matching
      const questionWords = intent.question.toLowerCase().split(/\s+/)
      const messageWords = normalizedMessage.split(/\s+/)

      for (const word of questionWords) {
        if (word.length > 3 && messageWords.includes(word)) {
          score += 1
        }
      }

      // Theme relevance
      const themeWords = intent.theme.toLowerCase().split(/\s+/)
      for (const word of themeWords) {
        if (messageWords.includes(word.toLowerCase())) {
          score += 2
        }
      }

      // Boost score if documents match artifact needs
      if (intent.needsDocuments && uploadedDocuments.length > 0) {
        score += 3
      }

      // Boost score based on product context matching
      if (productContext && intent.tags.productLine?.includes(productContext as any)) {
        score += 5
      }

      // Jurisdiction boost
      if (userLocation && intent.tags.jurisdiction?.includes(userLocation)) {
        score += 2
      }

      scores.push({ intent, score })
    }

    // Sort by score
    scores.sort((a, b) => b.score - a.score)

    const topIntent = scores[0]
    const confidence = Math.min(topIntent.score / 20, 1.0) // Normalize to 0-1

    // Determine if clarification is needed
    const clarificationNeeded = confidence < 0.6 || (
      topIntent.intent.needsDocuments && uploadedDocuments.length === 0
    ) || (
      topIntent.intent.needsPlanInfo && !productContext
    )

    let suggestedQuestion: string | undefined
    if (clarificationNeeded) {
      if (topIntent.intent.needsDocuments && uploadedDocuments.length === 0) {
        suggestedQuestion = 'Could you upload your medical bill, EOB, or other relevant documents to help me provide more specific guidance?'
      } else if (topIntent.intent.needsPlanInfo && !productContext) {
        suggestedQuestion = 'What type of insurance plan do you have (employer, Marketplace, Medicaid, etc.) to help me give you more accurate information?'
      } else if (confidence < 0.3) {
        suggestedQuestion = 'Could you provide more details about your specific insurance question or situation?'
      }
    }

    // Extract tags for context
    const extractedTags = {
      jurisdiction: userLocation || topIntent.intent.tags.jurisdiction?.[0] || 'federal',
      productLine: productContext || topIntent.intent.tags.productLine?.[0] || 'Individual',
      artifactType: uploadedDocuments.map(doc => doc.type || 'Unknown'),
      lifecycle: topIntent.intent.tags.lifecycle?.[0] || 'use',
      urgency: this.determineUrgency(userMessage, topIntent.intent)
    }

    return {
      primaryIntent: { ...topIntent.intent, confidence },
      secondaryIntents: scores.slice(1, 4).map(s => s.intent),
      confidence,
      clarificationNeeded: clarificationNeeded || false,
      suggestedQuestion,
      tags: extractedTags
    }
  }

  private static determineUrgency(message: string, intent: CanonicalIntent): 'low' | 'medium' | 'high' {
    const urgentKeywords = ['emergency', 'urgent', 'immediate', 'asap', 'deadline', 'appeal deadline']
    const mediumKeywords = ['bill', 'denial', 'balance', 'owe', 'charge']

    const lowerMessage = message.toLowerCase()

    if (urgentKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return 'high'
    }

    if (mediumKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return 'medium'
    }

    return 'low'
  }

  static getIntentById(intentId: string): CanonicalIntent | undefined {
    return this.intents.find(intent => intent.id === intentId)
  }

  static getIntentsByTheme(theme: string): CanonicalIntent[] {
    return this.intents.filter(intent => intent.theme === theme)
  }

  static getAllThemes(): string[] {
    return Array.from(new Set(this.intents.map(intent => intent.theme)))
  }

  static getParaphrases(intentId: string): string[] {
    return this.paraphraseMap.get(intentId) || []
  }

  // For evaluation and testing
  static evaluateClassification(testMessage: string, expectedIntentId: string): {
    correct: boolean
    confidence: number
    actualIntentId: string
  } {
    const result = this.classifyIntent(testMessage)
    return {
      correct: result.primaryIntent.id === expectedIntentId,
      confidence: result.confidence,
      actualIntentId: result.primaryIntent.id
    }
  }
}