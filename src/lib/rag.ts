import { searchLaws, extractKeywords as extractLawKeywords, type LawEntry } from './laws'
import { searchPolicies, detectInsurer, type PolicyEntry } from './policies'
import { enhanceGuidanceWithKnowledge, generateKnowledgeBasedCitations } from './knowledge-enhancer'

export interface RAGContext {
  laws: LawEntry[]
  policies: PolicyEntry[]
  detectedInsurer?: string
  knowledgeEnhancement?: {
    relevantPatterns: any[]
    applicableRegulations: any[]
    suggestedResources: any[]
    enhancedGuidance: string[]
    knowledgeBasedCitations: Array<{label: string, reference: string}>
  }
}

export function buildRAGContext(userQuestion?: string, ocrTexts?: string[], benefits?: any): RAGContext {
  // Combine all text sources for keyword extraction
  const allText = [
    userQuestion || '',
    ...(ocrTexts || []),
    JSON.stringify(benefits || {})
  ].join(' ')

  // Extract keywords for law search with enhanced patterns
  const keywords = extractLawKeywords(allText)

  // Add context-specific keywords
  const enhancedKeywords = [...keywords]

  if (allText.toLowerCase().includes('denied') || allText.toLowerCase().includes('rejected')) {
    enhancedKeywords.push('appeals', 'ERISA', 'denied claims')
  }

  if (allText.toLowerCase().includes('out of network') || allText.toLowerCase().includes('balance bill')) {
    enhancedKeywords.push('No Surprises Act', 'balance billing', 'out of network')
  }

  if (allText.toLowerCase().includes('preventive') || allText.toLowerCase().includes('wellness')) {
    enhancedKeywords.push('ACA', 'essential benefits', 'preventive care')
  }

  if (allText.toLowerCase().includes('emergency')) {
    enhancedKeywords.push('emergency', 'NSA', 'surprise billing')
  }

  // Detect insurer from text
  const detectedInsurer = detectInsurer(allText) || benefits?.insurerName

  // Search for relevant laws with enhanced keywords
  const relevantLaws = searchLaws(enhancedKeywords)

  // Search for relevant policies (prioritize detected insurer)
  const relevantPolicies = searchPolicies(enhancedKeywords, detectedInsurer)

  // Enhance with knowledge-based insights
  const knowledgeEnhancement = enhanceGuidanceWithKnowledge(
    userQuestion || '',
    ocrTexts || [],
    [] // detected issues would go here if we had them at this stage
  )

  // Generate knowledge-based citations
  const knowledgeBasedCitations = generateKnowledgeBasedCitations(
    knowledgeEnhancement.applicableRegulations
  )

  return {
    laws: relevantLaws.slice(0, 8), // Increased to 8 most relevant laws
    policies: relevantPolicies.slice(0, 5), // Increased to 5 most relevant policies
    detectedInsurer,
    knowledgeEnhancement: {
      ...knowledgeEnhancement,
      knowledgeBasedCitations
    }
  }
}

export function formatRAGContextForLLM(context: RAGContext): {
  lawBasis: string[]
  policyGuidance: string[]
  enhancedGuidance?: string[]
} {
  const lawBasis = context.laws.map(law =>
    `${law.title}: ${law.summary} (Source: ${law.source})`
  )

  const policyGuidance = context.policies.map(policy =>
    `${policy.insurerName} - ${policy.title}: ${policy.summary}`
  )

  // Add enhanced guidance from knowledge base
  const enhancedGuidance = context.knowledgeEnhancement?.enhancedGuidance || []

  return {
    lawBasis,
    policyGuidance,
    enhancedGuidance
  }
}