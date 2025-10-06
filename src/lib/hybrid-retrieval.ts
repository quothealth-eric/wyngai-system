import { CanonicalIntentClassifier, IntentClassificationV2 } from './canonical-intent-classifier'
import { buildRAGContext, RAGContext } from './rag'
import { searchLaws, type LawEntry } from './laws'
import { searchPolicies, type PolicyEntry } from './policies'

export interface JurisdictionBoost {
  state: string
  priority: number // 1-10, higher is more relevant
  regulations: string[]
  specialRules?: string[]
}

export interface HybridRetrievalContext extends RAGContext {
  jurisdiction: JurisdictionBoost
  intentContext: IntentClassificationV2
  bm25Results: RetrievalResult[]
  vectorResults: RetrievalResult[]
  fusedResults: RetrievalResult[]
  confidenceScore: number
}

export interface RetrievalResult {
  id: string
  source: 'law' | 'policy' | 'knowledge' | 'wyng'
  title: string
  content: string
  relevanceScore: number
  jurisdictionBoost: number
  intentMatchScore: number
  finalScore: number
  citation: string
  metadata: {
    documentType?: string
    effectiveDate?: string
    jurisdiction?: string
    productLine?: string[]
    artifactType?: string[]
  }
}

export class HybridRetrieval {
  private static jurisdictionData: Map<string, JurisdictionBoost> = new Map([
    ['federal', {
      state: 'federal',
      priority: 10,
      regulations: ['ACA', 'ERISA', 'HIPAA', 'NSA', 'CAA'],
      specialRules: ['No Surprises Act', 'Consolidated Appropriations Act']
    }],
    ['ca', {
      state: 'california',
      priority: 9,
      regulations: ['SB-30', 'AB-72', 'California Surprise Bill Protection'],
      specialRules: ['Enhanced balance billing protections', 'Additional mental health parity']
    }],
    ['ny', {
      state: 'new_york',
      priority: 9,
      regulations: ['NY Insurance Law 3224-a', 'NY Public Health Law'],
      specialRules: ['NY Emergency Treatment Act', 'Enhanced appeal rights']
    }],
    ['tx', {
      state: 'texas',
      priority: 8,
      regulations: ['Texas Insurance Code Chapter 1301', 'HB 2046'],
      specialRules: ['Texas balance billing protections', 'Provider network adequacy']
    }],
    ['fl', {
      state: 'florida',
      priority: 8,
      regulations: ['Florida Statutes 627.64194', 'Florida Balance Billing Law'],
      specialRules: ['FL surprise billing protections', 'Emergency services coverage']
    }]
  ])

  static initialize(): void {
    console.log('🔍 Initializing Hybrid Retrieval with jurisdiction support')
    CanonicalIntentClassifier.initialize()
  }

  static async retrieveWithHybridSearch(
    userMessage: string,
    ocrTexts: string[] = [],
    userLocation?: string,
    productContext?: string,
    uploadedDocuments: any[] = []
  ): Promise<HybridRetrievalContext> {

    // Step 1: Intent Classification with canonical questions
    const intentClassification = CanonicalIntentClassifier.classifyIntent(
      userMessage,
      uploadedDocuments,
      userLocation,
      productContext
    )

    // Step 2: Determine jurisdiction
    const jurisdiction = this.determineJurisdiction(userLocation, intentClassification)

    // Step 3: Traditional RAG context building
    const ragContext = buildRAGContext(userMessage, ocrTexts, {
      userLocation,
      productContext
    })

    // Step 4: BM25 keyword-based retrieval
    const bm25Results = await this.performBM25Retrieval(
      userMessage,
      ocrTexts,
      intentClassification,
      jurisdiction
    )

    // Step 5: Vector-based semantic retrieval
    const vectorResults = await this.performVectorRetrieval(
      userMessage,
      intentClassification,
      jurisdiction
    )

    // Step 6: Fusion with jurisdiction and intent boosting
    const fusedResults = this.fuseRetrievalResults(
      bm25Results,
      vectorResults,
      intentClassification,
      jurisdiction
    )

    // Step 7: Calculate overall confidence
    const confidenceScore = this.calculateConfidence(
      intentClassification,
      fusedResults,
      jurisdiction
    )

    return {
      ...ragContext,
      jurisdiction,
      intentContext: intentClassification,
      bm25Results,
      vectorResults,
      fusedResults,
      confidenceScore
    }
  }

  private static determineJurisdiction(
    userLocation?: string,
    intentClassification?: IntentClassificationV2
  ): JurisdictionBoost {
    // Extract jurisdiction from intent tags or user location
    const jurisdictionTag = intentClassification?.tags.jurisdiction || userLocation

    // Map common state names to codes
    const stateMap: Record<string, string> = {
      'california': 'ca',
      'new york': 'ny',
      'texas': 'tx',
      'florida': 'fl'
    }

    const normalizedJurisdiction = jurisdictionTag?.toLowerCase()
    const stateCode = stateMap[normalizedJurisdiction || ''] || normalizedJurisdiction

    return this.jurisdictionData.get(stateCode || 'federal') ||
           this.jurisdictionData.get('federal')!
  }

  private static async performBM25Retrieval(
    userMessage: string,
    ocrTexts: string[],
    intentClassification: IntentClassificationV2,
    jurisdiction: JurisdictionBoost
  ): Promise<RetrievalResult[]> {

    const results: RetrievalResult[] = []
    const combinedText = [userMessage, ...ocrTexts].join(' ')

    // Extract enhanced keywords based on intent
    const keywords = this.extractKeywordsFromIntent(intentClassification, combinedText)

    // Add jurisdiction-specific keywords
    keywords.push(...jurisdiction.regulations)
    if (jurisdiction.specialRules) {
      keywords.push(...jurisdiction.specialRules)
    }

    // Search laws with keyword matching
    const lawResults = searchLaws(keywords)
    lawResults.forEach((law, index) => {
      const keywordMatches = this.countKeywordMatches(law.summary, keywords)
      const relevanceScore = keywordMatches / keywords.length

      results.push({
        id: `law_${index}`,
        source: 'law',
        title: law.title,
        content: law.summary,
        relevanceScore,
        jurisdictionBoost: 0, // Will be calculated in fusion
        intentMatchScore: 0, // Will be calculated in fusion
        finalScore: relevanceScore,
        citation: law.source,
        metadata: {
          documentType: 'regulation',
          jurisdiction: law.jurisdiction || 'federal'
        }
      })
    })

    // Search policies with keyword matching
    const policyResults = searchPolicies(keywords,
      intentClassification.tags.productLine || undefined)
    policyResults.forEach((policy, index) => {
      const keywordMatches = this.countKeywordMatches(policy.summary, keywords)
      const relevanceScore = keywordMatches / keywords.length

      results.push({
        id: `policy_${index}`,
        source: 'policy',
        title: `${policy.insurerName} - ${policy.title}`,
        content: policy.summary,
        relevanceScore,
        jurisdictionBoost: 0,
        intentMatchScore: 0,
        finalScore: relevanceScore,
        citation: `${policy.insurerName} Policy Documentation`,
        metadata: {
          documentType: 'policy',
          productLine: [policy.insurerName]
        }
      })
    })

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 20)
  }

  private static async performVectorRetrieval(
    userMessage: string,
    intentClassification: IntentClassificationV2,
    jurisdiction: JurisdictionBoost
  ): Promise<RetrievalResult[]> {

    // For now, use semantic similarity based on intent paraphrases
    // In a full implementation, this would use actual vector embeddings
    const results: RetrievalResult[] = []

    const primaryIntent = intentClassification.primaryIntent
    const semanticQueries = [
      userMessage,
      primaryIntent.question,
      ...primaryIntent.paraphrases.slice(0, 5)
    ]

    // Simulate vector retrieval with intent-based semantic matching
    // This would be replaced with actual vector database queries in production
    for (const query of semanticQueries) {
      const semanticResults = this.simulateVectorSearch(query, jurisdiction)
      results.push(...semanticResults)
    }

    // Remove duplicates and sort by semantic similarity
    const uniqueResults = this.deduplicateResults(results)
    return uniqueResults.slice(0, 15)
  }

  private static simulateVectorSearch(
    query: string,
    jurisdiction: JurisdictionBoost
  ): RetrievalResult[] {
    // Simulate vector retrieval using keyword overlap
    // In production, this would query a vector database
    const mockResults: RetrievalResult[] = []

    const queryTerms = query.toLowerCase().split(/\s+/)

    // Generate mock results based on common insurance topics
    const topicTemplates = [
      {
        title: 'Understanding Your Explanation of Benefits (EOB)',
        content: 'An EOB shows what your insurance paid and what you might owe. It includes allowed amounts, deductibles applied, and your responsibility.',
        source: 'wyng' as const,
        baseScore: 0.8
      },
      {
        title: 'Appeals Process for Denied Claims',
        content: 'When your claim is denied, you have the right to appeal. Start with an internal appeal to your insurance company, then external if needed.',
        source: 'wyng' as const,
        baseScore: 0.7
      },
      {
        title: 'Balance Billing Protections',
        content: 'The No Surprises Act protects you from unexpected bills when receiving emergency care or certain services from out-of-network providers.',
        source: 'law' as const,
        baseScore: 0.9
      }
    ]

    topicTemplates.forEach((template, index) => {
      const contentTerms = template.content.toLowerCase().split(/\s+/)
      const overlap = queryTerms.filter(term =>
        contentTerms.some(contentTerm => contentTerm.includes(term) || term.includes(contentTerm))
      ).length

      const semanticScore = overlap / queryTerms.length

      if (semanticScore > 0.1) { // Only include if there's some relevance
        mockResults.push({
          id: `vector_${template.source}_${index}`,
          source: template.source,
          title: template.title,
          content: template.content,
          relevanceScore: semanticScore * template.baseScore,
          jurisdictionBoost: 0,
          intentMatchScore: 0,
          finalScore: semanticScore * template.baseScore,
          citation: template.source === 'wyng' ? 'Wyng Health Knowledge Base' :
                   template.source === 'law' ? 'Federal Health Insurance Regulations' :
                   'Insurance Industry Guidelines',
          metadata: {
            documentType: template.source === 'law' ? 'regulation' : 'guidance',
            jurisdiction: 'federal'
          }
        })
      }
    })

    return mockResults
  }

  private static fuseRetrievalResults(
    bm25Results: RetrievalResult[],
    vectorResults: RetrievalResult[],
    intentClassification: IntentClassificationV2,
    jurisdiction: JurisdictionBoost
  ): RetrievalResult[] {

    // Combine and deduplicate results
    const allResults = [...bm25Results, ...vectorResults]
    const uniqueResults = this.deduplicateResults(allResults)

    // Apply jurisdiction and intent boosting
    uniqueResults.forEach(result => {
      // Jurisdiction boost
      result.jurisdictionBoost = this.calculateJurisdictionBoost(result, jurisdiction)

      // Intent match boost
      result.intentMatchScore = this.calculateIntentMatchScore(result, intentClassification)

      // Calculate final score: base relevance + jurisdiction boost + intent boost
      result.finalScore = (
        result.relevanceScore * 0.5 +
        result.jurisdictionBoost * 0.3 +
        result.intentMatchScore * 0.2
      )
    })

    // Sort by final score and return top results
    return uniqueResults.sort((a, b) => b.finalScore - a.finalScore).slice(0, 12)
  }

  private static calculateJurisdictionBoost(
    result: RetrievalResult,
    jurisdiction: JurisdictionBoost
  ): number {
    let boost = 0

    // Perfect jurisdiction match
    if (result.metadata.jurisdiction === jurisdiction.state) {
      boost += 0.4
    }

    // Federal laws apply everywhere
    if (result.metadata.jurisdiction === 'federal') {
      boost += 0.3
    }

    // Check if result mentions jurisdiction-specific regulations
    const contentLower = result.content.toLowerCase()
    jurisdiction.regulations.forEach(regulation => {
      if (contentLower.includes(regulation.toLowerCase())) {
        boost += 0.1
      }
    })

    return Math.min(boost, 1.0) // Cap at 1.0
  }

  private static calculateIntentMatchScore(
    result: RetrievalResult,
    intentClassification: IntentClassificationV2
  ): number {
    let score = 0
    const primaryIntent = intentClassification.primaryIntent

    // Check theme alignment
    const resultLower = result.content.toLowerCase()
    const themeWords = primaryIntent.theme.toLowerCase().split(/\s+/)

    themeWords.forEach(word => {
      if (word.length > 3 && resultLower.includes(word)) {
        score += 0.1
      }
    })

    // Check artifact type alignment
    if (primaryIntent.tags.artifactType) {
      primaryIntent.tags.artifactType.forEach(artifactType => {
        if (resultLower.includes(artifactType.toLowerCase())) {
          score += 0.15
        }
      })
    }

    // Check product line alignment
    if (primaryIntent.tags.productLine && result.metadata.productLine) {
      const hasMatch = primaryIntent.tags.productLine.some(productLine =>
        result.metadata.productLine?.includes(productLine)
      )
      if (hasMatch) {
        score += 0.2
      }
    }

    return Math.min(score, 1.0)
  }

  private static calculateConfidence(
    intentClassification: IntentClassificationV2,
    fusedResults: RetrievalResult[],
    jurisdiction: JurisdictionBoost
  ): number {
    let confidence = intentClassification.confidence * 0.4 // Base intent confidence

    // Boost confidence based on result quality
    if (fusedResults.length > 0) {
      const avgResultScore = fusedResults.slice(0, 5).reduce((sum, result) =>
        sum + result.finalScore, 0) / Math.min(fusedResults.length, 5)
      confidence += avgResultScore * 0.3
    }

    // Boost confidence based on jurisdiction certainty
    confidence += (jurisdiction.priority / 10) * 0.2

    // Boost if we have diverse source types
    const sourceTypes = new Set(fusedResults.map(r => r.source))
    if (sourceTypes.size >= 2) {
      confidence += 0.1
    }

    return Math.min(confidence, 1.0)
  }

  private static extractKeywordsFromIntent(
    intentClassification: IntentClassificationV2,
    text: string
  ): string[] {
    const keywords: string[] = []
    const primaryIntent = intentClassification.primaryIntent

    // Add theme-based keywords
    keywords.push(...primaryIntent.theme.toLowerCase().split(/\s+/).filter(w => w.length > 3))

    // Add artifact-specific keywords
    if (primaryIntent.tags.artifactType) {
      keywords.push(...primaryIntent.tags.artifactType.map(type => type.toLowerCase()))
    }

    // Add lifecycle keywords
    if (primaryIntent.tags.lifecycle) {
      keywords.push(...primaryIntent.tags.lifecycle)
    }

    // Add care type keywords
    if (primaryIntent.tags.careType) {
      keywords.push(...primaryIntent.tags.careType.map(type => type.replace('_', ' ')))
    }

    // Extract important terms from text
    const textKeywords = text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 4 &&
        !['this', 'that', 'with', 'have', 'been', 'will', 'from', 'they', 'what', 'when', 'where'].includes(word))

    keywords.push(...textKeywords.slice(0, 10))

    return Array.from(new Set(keywords)) // Remove duplicates
  }

  private static countKeywordMatches(text: string, keywords: string[]): number {
    const textLower = text.toLowerCase()
    return keywords.filter(keyword =>
      textLower.includes(keyword.toLowerCase())
    ).length
  }

  private static deduplicateResults(results: RetrievalResult[]): RetrievalResult[] {
    const seen = new Set<string>()
    return results.filter(result => {
      const key = `${result.source}_${result.title.toLowerCase()}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  // Public method for debugging and evaluation
  static async evaluateRetrieval(
    testQuery: string,
    expectedSources: string[],
    userLocation?: string
  ): Promise<{
    precision: number
    recall: number
    jurisdictionAccuracy: number
    intentAccuracy: number
  }> {
    const results = await this.retrieveWithHybridSearch(testQuery, [], userLocation)

    const retrievedSources = results.fusedResults.slice(0, 5).map(r => r.citation)
    const relevant = retrievedSources.filter(source =>
      expectedSources.some(expected => source.includes(expected))
    )

    const precision = relevant.length / retrievedSources.length
    const recall = relevant.length / expectedSources.length

    return {
      precision,
      recall,
      jurisdictionAccuracy: results.jurisdiction.priority / 10,
      intentAccuracy: results.intentContext.confidence
    }
  }
}