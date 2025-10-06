import { WyngCitation } from './grounded-answer-synthesis'

export interface WyngSourceRegistry {
  laws: Map<string, LawSource>
  policies: Map<string, PolicySource>
  knowledge: Map<string, KnowledgeSource>
  plans: Map<string, PlanSource>
}

export interface LawSource {
  id: string
  title: string
  citation: string
  jurisdiction: string
  effectiveDate: string
  url: string
  sections: Map<string, string>
  tags: string[]
}

export interface PolicySource {
  id: string
  insurerName: string
  title: string
  documentType: 'policy' | 'summary_of_benefits' | 'evidence_of_coverage'
  effectiveDate: string
  jurisdiction: string[]
  productLines: string[]
  sections: Map<string, string>
}

export interface KnowledgeSource {
  id: string
  title: string
  category: string
  lastUpdated: string
  accuracy: number
  reviewedBy: string[]
  content: string
  relatedTopics: string[]
}

export interface PlanSource {
  id: string
  planName: string
  insurerName: string
  planType: string
  effectiveYear: string
  benefits: Map<string, any>
  networks: string[]
  formulary?: string
}

export interface FormattedCitation {
  displayText: string
  fullReference: string
  hyperlink?: string
  confidence: number
  lastVerified: string
  citationStyle: 'wyng' | 'legal' | 'policy' | 'plan'
}

export class WyngCitationSystem {
  private static sourceRegistry: WyngSourceRegistry = {
    laws: new Map(),
    policies: new Map(),
    knowledge: new Map(),
    plans: new Map()
  }

  static initialize(): void {
    console.log('📚 Initializing Wyng Citation System')
    this.loadLawSources()
    this.loadPolicySources()
    this.loadKnowledgeSources()
    console.log('✅ Citation system loaded with source registry')
  }

  private static loadLawSources(): void {
    // Load federal health insurance laws
    const federalLaws: LawSource[] = [
      {
        id: 'aca_2010',
        title: 'Affordable Care Act',
        citation: '42 USC 18001 et seq.',
        jurisdiction: 'federal',
        effectiveDate: '2010-03-23',
        url: 'https://www.congress.gov/bill/111th-congress/house-bill/3590',
        sections: new Map([
          ['essential_benefits', '42 USC 18022'],
          ['preventive_care', '42 USC 18022(b)(1)'],
          ['appeals', '42 USC 18011']
        ]),
        tags: ['essential_benefits', 'preventive_care', 'marketplace', 'subsidies']
      },
      {
        id: 'erisa_1974',
        title: 'Employee Retirement Income Security Act',
        citation: '29 USC 1001 et seq.',
        jurisdiction: 'federal',
        effectiveDate: '1974-09-02',
        url: 'https://www.dol.gov/agencies/ebsa/laws-and-regulations/laws/erisa',
        sections: new Map([
          ['fiduciary_duty', '29 USC 1104'],
          ['appeals', '29 USC 1133'],
          ['disclosure', '29 USC 1021']
        ]),
        tags: ['employer_plans', 'appeals', 'fiduciary', 'disclosure']
      },
      {
        id: 'nsa_2020',
        title: 'No Surprises Act',
        citation: 'Consolidated Appropriations Act, 2021, Div. BB',
        jurisdiction: 'federal',
        effectiveDate: '2022-01-01',
        url: 'https://www.cms.gov/nosurprises',
        sections: new Map([
          ['balance_billing', 'Sec. 2799A-1'],
          ['emergency_services', 'Sec. 2799A-2'],
          ['air_ambulance', 'Sec. 2799A-3']
        ]),
        tags: ['balance_billing', 'emergency', 'out_of_network', 'surprise_billing']
      },
      {
        id: 'hipaa_1996',
        title: 'Health Insurance Portability and Accountability Act',
        citation: '42 USC 1320d et seq.',
        jurisdiction: 'federal',
        effectiveDate: '1996-08-21',
        url: 'https://www.hhs.gov/hipaa/',
        sections: new Map([
          ['privacy', '45 CFR 164.502'],
          ['portability', '29 USC 1181'],
          ['nondiscrimination', '29 USC 1182']
        ]),
        tags: ['privacy', 'portability', 'nondiscrimination', 'preexisting_conditions']
      }
    ]

    federalLaws.forEach(law => {
      this.sourceRegistry.laws.set(law.id, law)
    })
  }

  private static loadPolicySources(): void {
    // Load common insurer policy templates
    const policyTemplates: PolicySource[] = [
      {
        id: 'anthem_eoc_template',
        insurerName: 'Anthem',
        title: 'Evidence of Coverage Template',
        documentType: 'evidence_of_coverage',
        effectiveDate: '2024-01-01',
        jurisdiction: ['all'],
        productLines: ['Individual', 'Employer'],
        sections: new Map([
          ['appeals', 'Section 7: Appeals and Grievances'],
          ['emergency', 'Section 4: Emergency Services'],
          ['preventive', 'Section 3: Preventive Care Benefits']
        ])
      },
      {
        id: 'aetna_sbc_template',
        insurerName: 'Aetna',
        title: 'Summary of Benefits and Coverage',
        documentType: 'summary_of_benefits',
        effectiveDate: '2024-01-01',
        jurisdiction: ['all'],
        productLines: ['Individual', 'Employer'],
        sections: new Map([
          ['cost_sharing', 'Page 2: Cost Sharing'],
          ['covered_services', 'Page 3-4: Covered Services'],
          ['excluded_services', 'Page 5: Excluded Services']
        ])
      }
    ]

    policyTemplates.forEach(policy => {
      this.sourceRegistry.policies.set(policy.id, policy)
    })
  }

  private static loadKnowledgeSources(): void {
    // Load Wyng knowledge base entries
    const knowledgeEntries: KnowledgeSource[] = [
      {
        id: 'eob_reading_guide',
        title: 'How to Read Your Explanation of Benefits (EOB)',
        category: 'billing_basics',
        lastUpdated: '2024-01-15',
        accuracy: 0.95,
        reviewedBy: ['healthcare_expert_1', 'insurance_specialist_2'],
        content: 'An EOB explains what your insurance paid and what you owe...',
        relatedTopics: ['medical_bills', 'insurance_claims', 'cost_sharing']
      },
      {
        id: 'appeal_process_guide',
        title: 'Complete Guide to Insurance Appeals',
        category: 'appeals_advocacy',
        lastUpdated: '2024-02-01',
        accuracy: 0.98,
        reviewedBy: ['legal_expert_1', 'patient_advocate_2'],
        content: 'When your insurance denies a claim, you have appeal rights...',
        relatedTopics: ['claim_denials', 'erisa_appeals', 'external_review']
      },
      {
        id: 'balance_billing_protection',
        title: 'No Surprises Act: Balance Billing Protection',
        category: 'consumer_protection',
        lastUpdated: '2024-01-20',
        accuracy: 0.97,
        reviewedBy: ['policy_expert_1', 'legal_expert_2'],
        content: 'The No Surprises Act protects you from unexpected medical bills...',
        relatedTopics: ['surprise_billing', 'out_of_network', 'emergency_care']
      }
    ]

    knowledgeEntries.forEach(entry => {
      this.sourceRegistry.knowledge.set(entry.id, entry)
    })
  }

  static formatCitation(citation: WyngCitation): FormattedCitation {
    switch (citation.type) {
      case 'law':
        return this.formatLawCitation(citation)
      case 'policy':
        return this.formatPolicyCitation(citation)
      case 'wyng_knowledge':
        return this.formatKnowledgeCitation(citation)
      case 'plan_document':
        return this.formatPlanCitation(citation)
      default:
        return this.formatGenericCitation(citation)
    }
  }

  private static formatLawCitation(citation: WyngCitation): FormattedCitation {
    // Wyng legal citation format: "Law Title, Citation (Jurisdiction Year)"
    const lawSource = this.findLawSource(citation.source)

    let displayText: string
    let fullReference: string
    let hyperlink: string | undefined

    if (lawSource) {
      displayText = `${lawSource.title}`
      fullReference = `${lawSource.title}, ${lawSource.citation} (${lawSource.jurisdiction} ${new Date(lawSource.effectiveDate).getFullYear()})`
      hyperlink = lawSource.url
    } else {
      // Fallback formatting for unknown sources
      displayText = citation.title
      fullReference = `${citation.title}, ${citation.source}`
      hyperlink = citation.url
    }

    return {
      displayText,
      fullReference,
      hyperlink,
      confidence: this.calculateCitationConfidence('law', citation),
      lastVerified: new Date().toISOString().split('T')[0],
      citationStyle: 'legal'
    }
  }

  private static formatPolicyCitation(citation: WyngCitation): FormattedCitation {
    // Wyng policy citation format: "Insurer Name Policy Document (Effective Date)"
    const policySource = this.findPolicySource(citation.source)

    let displayText: string
    let fullReference: string

    if (policySource) {
      displayText = `${policySource.insurerName} ${policySource.documentType.replace(/_/g, ' ')}`
      fullReference = `${policySource.insurerName} ${policySource.title} (Effective ${policySource.effectiveDate})`
    } else {
      displayText = citation.title
      fullReference = `${citation.title}, ${citation.source}`
    }

    return {
      displayText,
      fullReference,
      hyperlink: citation.url,
      confidence: this.calculateCitationConfidence('policy', citation),
      lastVerified: new Date().toISOString().split('T')[0],
      citationStyle: 'policy'
    }
  }

  private static formatKnowledgeCitation(citation: WyngCitation): FormattedCitation {
    // Wyng knowledge citation format: "Article Title | Wyng Health (Last Updated)"
    const knowledgeSource = this.findKnowledgeSource(citation.title)

    let displayText: string
    let fullReference: string

    if (knowledgeSource) {
      displayText = `${knowledgeSource.title} | Wyng Health`
      fullReference = `${knowledgeSource.title}, Wyng Health Knowledge Base (Last updated: ${knowledgeSource.lastUpdated})`
    } else {
      displayText = `${citation.title} | Wyng Health`
      fullReference = `${citation.title}, Wyng Health Knowledge Base`
    }

    return {
      displayText,
      fullReference,
      hyperlink: citation.url || 'https://wyng.health/knowledge',
      confidence: knowledgeSource?.accuracy || 0.85,
      lastVerified: knowledgeSource?.lastUpdated || new Date().toISOString().split('T')[0],
      citationStyle: 'wyng'
    }
  }

  private static formatPlanCitation(citation: WyngCitation): FormattedCitation {
    // Wyng plan citation format: "Plan Name | Insurer (Plan Year)"
    return {
      displayText: citation.title,
      fullReference: `${citation.title}, ${citation.source}`,
      hyperlink: citation.url,
      confidence: 0.90, // Plan documents are generally accurate
      lastVerified: new Date().toISOString().split('T')[0],
      citationStyle: 'plan'
    }
  }

  private static formatGenericCitation(citation: WyngCitation): FormattedCitation {
    return {
      displayText: citation.title,
      fullReference: `${citation.title}, ${citation.source}`,
      hyperlink: citation.url,
      confidence: 0.80, // Default confidence for generic sources
      lastVerified: new Date().toISOString().split('T')[0],
      citationStyle: 'wyng'
    }
  }

  private static findLawSource(sourceText: string): LawSource | undefined {
    // Try to match by citation patterns
    for (const [id, law] of this.sourceRegistry.laws) {
      if (sourceText.includes(law.citation) ||
          sourceText.toLowerCase().includes(law.title.toLowerCase()) ||
          law.tags.some(tag => sourceText.toLowerCase().includes(tag))) {
        return law
      }
    }
    return undefined
  }

  private static findPolicySource(sourceText: string): PolicySource | undefined {
    for (const [id, policy] of this.sourceRegistry.policies) {
      if (sourceText.toLowerCase().includes(policy.insurerName.toLowerCase()) ||
          sourceText.toLowerCase().includes(policy.title.toLowerCase())) {
        return policy
      }
    }
    return undefined
  }

  private static findKnowledgeSource(title: string): KnowledgeSource | undefined {
    for (const [id, knowledge] of this.sourceRegistry.knowledge) {
      if (title.toLowerCase().includes(knowledge.title.toLowerCase()) ||
          knowledge.relatedTopics.some(topic => title.toLowerCase().includes(topic))) {
        return knowledge
      }
    }
    return undefined
  }

  private static calculateCitationConfidence(
    type: 'law' | 'policy' | 'knowledge',
    citation: WyngCitation
  ): number {
    let confidence = 0.8 // Base confidence

    // Type-specific confidence adjustments
    switch (type) {
      case 'law':
        confidence = 0.95 // Legal sources are highly reliable
        break
      case 'policy':
        confidence = 0.90 // Policy documents are generally accurate
        break
      case 'knowledge':
        const source = this.findKnowledgeSource(citation.title)
        confidence = source?.accuracy || 0.85
        break
    }

    // Adjust based on recency
    if (citation.effectiveDate) {
      const effectiveDate = new Date(citation.effectiveDate)
      const now = new Date()
      const ageInYears = (now.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24 * 365)

      if (ageInYears > 5) {
        confidence *= 0.9 // Slightly lower confidence for older sources
      }
    }

    return Math.round(confidence * 100) / 100
  }

  static generateInlineCitations(
    text: string,
    citations: WyngCitation[]
  ): string {
    let citedText = text
    const citationMap = new Map<string, number>()

    // Add citation numbers to the text
    citations.forEach((citation, index) => {
      const citationNumber = index + 1
      citationMap.set(citation.id, citationNumber)

      // Look for opportunities to add inline citations
      const keyPhrases = this.extractKeyPhrasesFromCitation(citation)

      keyPhrases.forEach(phrase => {
        const regex = new RegExp(`\\b${phrase}\\b`, 'gi')
        if (citedText.match(regex) && !citedText.includes(`[${citationNumber}]`)) {
          citedText = citedText.replace(regex, `${phrase}[${citationNumber}]`)
        }
      })
    })

    return citedText
  }

  private static extractKeyPhrasesFromCitation(citation: WyngCitation): string[] {
    const phrases: string[] = []

    // Extract key phrases based on citation type
    if (citation.type === 'law') {
      if (citation.title.includes('Affordable Care Act')) {
        phrases.push('ACA', 'essential health benefits', 'preventive care')
      }
      if (citation.title.includes('No Surprises Act')) {
        phrases.push('balance billing', 'surprise billing', 'out-of-network')
      }
      if (citation.title.includes('ERISA')) {
        phrases.push('appeal rights', 'employer plan', 'fiduciary duty')
      }
    } else if (citation.type === 'wyng_knowledge') {
      if (citation.title.includes('EOB')) {
        phrases.push('Explanation of Benefits', 'EOB')
      }
      if (citation.title.includes('appeal')) {
        phrases.push('appeal process', 'claim denial')
      }
    }

    return phrases
  }

  static formatCitationList(citations: WyngCitation[]): string {
    const formattedCitations = citations.map((citation, index) => {
      const formatted = this.formatCitation(citation)
      return `[${index + 1}] ${formatted.fullReference}`
    })

    return `\n\n**Sources:**\n${formattedCitations.join('\n')}`
  }

  static validateCitations(citations: WyngCitation[]): {
    valid: boolean
    issues: string[]
    suggestions: string[]
  } {
    const issues: string[] = []
    const suggestions: string[] = []

    citations.forEach((citation, index) => {
      // Check for required fields
      if (!citation.title || citation.title.trim().length === 0) {
        issues.push(`Citation ${index + 1}: Missing title`)
      }

      if (!citation.source || citation.source.trim().length === 0) {
        issues.push(`Citation ${index + 1}: Missing source`)
      }

      // Check for appropriate citation types
      if (!['law', 'policy', 'wyng_knowledge', 'plan_document', 'regulatory'].includes(citation.type)) {
        issues.push(`Citation ${index + 1}: Invalid citation type`)
      }

      // Suggest improvements
      if (citation.type === 'law' && !citation.jurisdiction) {
        suggestions.push(`Citation ${index + 1}: Consider adding jurisdiction information`)
      }

      if (!citation.url && citation.type === 'wyng_knowledge') {
        suggestions.push(`Citation ${index + 1}: Consider adding URL for knowledge base articles`)
      }
    })

    return {
      valid: issues.length === 0,
      issues,
      suggestions
    }
  }

  // Public utility methods
  static getCitationById(id: string): WyngCitation | undefined {
    // Search across all source types
    for (const [sourceId, law] of this.sourceRegistry.laws) {
      if (sourceId === id) {
        return {
          id,
          type: 'law',
          title: law.title,
          source: law.citation,
          relevanceContext: 'Legal requirement',
          jurisdiction: law.jurisdiction,
          url: law.url
        }
      }
    }

    for (const [sourceId, policy] of this.sourceRegistry.policies) {
      if (sourceId === id) {
        return {
          id,
          type: 'policy',
          title: policy.title,
          source: `${policy.insurerName} Policy`,
          relevanceContext: 'Policy guidance'
        }
      }
    }

    for (const [sourceId, knowledge] of this.sourceRegistry.knowledge) {
      if (sourceId === id) {
        return {
          id,
          type: 'wyng_knowledge',
          title: knowledge.title,
          source: 'Wyng Health Knowledge Base',
          relevanceContext: 'Educational resource',
          url: 'https://wyng.health/knowledge'
        }
      }
    }

    return undefined
  }

  static searchSources(query: string, type?: string): WyngCitation[] {
    const results: WyngCitation[] = []
    const lowerQuery = query.toLowerCase()

    // Search laws
    if (!type || type === 'law') {
      for (const [id, law] of this.sourceRegistry.laws) {
        if (law.title.toLowerCase().includes(lowerQuery) ||
            law.tags.some(tag => tag.includes(lowerQuery))) {
          results.push({
            id,
            type: 'law',
            title: law.title,
            source: law.citation,
            relevanceContext: 'Legal requirement',
            jurisdiction: law.jurisdiction,
            url: law.url
          })
        }
      }
    }

    // Search knowledge base
    if (!type || type === 'knowledge') {
      for (const [id, knowledge] of this.sourceRegistry.knowledge) {
        if (knowledge.title.toLowerCase().includes(lowerQuery) ||
            knowledge.content.toLowerCase().includes(lowerQuery) ||
            knowledge.relatedTopics.some(topic => topic.includes(lowerQuery))) {
          results.push({
            id,
            type: 'wyng_knowledge',
            title: knowledge.title,
            source: 'Wyng Health Knowledge Base',
            relevanceContext: 'Educational resource',
            url: 'https://wyng.health/knowledge'
          })
        }
      }
    }

    return results
  }
}