/**
 * Authoritative Healthcare Knowledge Base
 * Comprehensive collection of federal, state, and regulatory sources
 */

export interface AuthoritativeSource {
  id: string
  authority: 'Federal' | 'State' | 'CMS' | 'Payer_Policy' | 'Professional_Association'
  source: string
  section?: string
  title: string
  content: string
  effective_date: string
  url?: string
  jurisdiction?: string // For state-specific sources
  tags: string[]
  relevance_keywords: string[]
  citation_format: string
  last_updated: string
  reliability_score: number // 0-100
}

export interface KnowledgeRetrievalRequest {
  intent: string
  taxonomy_code: string
  entities: {
    state?: string
    payer?: string
    plan_type?: string
    service_type?: string
  }
  search_terms: string[]
  max_results?: number
}

export interface KnowledgeRetrievalResult {
  sources: AuthoritativeSource[]
  total_found: number
  search_time_ms: number
  relevance_scores: Record<string, number>
}

/**
 * Comprehensive authoritative source database
 */
export const AUTHORITATIVE_SOURCES: AuthoritativeSource[] = [
  // FEDERAL REGULATIONS
  {
    id: 'fed_nsa_001',
    authority: 'Federal',
    source: '45 CFR 149.410',
    section: '149.410(b)',
    title: 'No Surprises Act - Patient Protections for Emergency Services',
    content: 'A group health plan or health insurance issuer offering group or individual health insurance coverage shall not require prior authorization for emergency services. The plan or issuer shall cover emergency services provided by nonparticipating providers and emergency facilities without prior authorization regardless of whether the nonparticipating provider or emergency facility has a contractual relationship with the plan or issuer.',
    effective_date: '2022-01-01',
    url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/section-149.410',
    tags: ['surprise_billing', 'emergency_services', 'out_of_network', 'prior_authorization'],
    relevance_keywords: ['emergency', 'surprise billing', 'out-of-network', 'nonparticipating provider', 'prior authorization'],
    citation_format: '45 CFR § 149.410(b)',
    last_updated: '2024-01-15',
    reliability_score: 100
  },
  {
    id: 'fed_nsa_002',
    authority: 'Federal',
    source: '45 CFR 149.120',
    section: '149.120(a)',
    title: 'No Surprises Act - Ancillary Services at In-Network Facilities',
    content: 'A group health plan or health insurance issuer shall not impose cost-sharing requirements for ancillary services provided by a nonparticipating provider at a participating health care facility that are greater than the requirements that would apply if such services were provided by a participating provider.',
    effective_date: '2022-01-01',
    url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/section-149.120',
    tags: ['surprise_billing', 'ancillary_services', 'in_network_facility', 'cost_sharing'],
    relevance_keywords: ['ancillary services', 'nonparticipating provider', 'participating facility', 'cost-sharing'],
    citation_format: '45 CFR § 149.120(a)',
    last_updated: '2024-01-15',
    reliability_score: 100
  },
  {
    id: 'fed_aca_001',
    authority: 'Federal',
    source: '45 CFR 147.130',
    section: '147.130(a)',
    title: 'ACA Preventive Services - No Cost Sharing',
    content: 'A group health plan or health insurance issuer offering group or individual health insurance coverage shall not impose any cost-sharing requirements (including copayments, coinsurance, or deductibles) with respect to preventive health services that have a rating of A or B in the current recommendations of the United States Preventive Services Task Force.',
    effective_date: '2010-09-23',
    url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-147/section-147.130',
    tags: ['preventive_care', 'cost_sharing', 'uspstf', 'screening'],
    relevance_keywords: ['preventive services', 'cost-sharing', 'copayments', 'coinsurance', 'deductibles', 'screening'],
    citation_format: '45 CFR § 147.130(a)',
    last_updated: '2024-01-15',
    reliability_score: 100
  },
  {
    id: 'fed_erisa_001',
    authority: 'Federal',
    source: '29 CFR 2560.503-1',
    section: '2560.503-1(h)',
    title: 'ERISA Claims Procedures - Appeals Process',
    content: 'A claimant shall have at least 180 days following receipt of a notification of an adverse benefit determination within which to appeal the determination. The time period within which a benefit determination is required to be made shall begin at the time an appeal is filed in accordance with the procedures of the plan.',
    effective_date: '2001-01-01',
    url: 'https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XXV/subchapter-L/part-2560/section-2560.503-1',
    tags: ['appeals', 'erisa', 'claims_procedures', 'adverse_determination'],
    relevance_keywords: ['appeal', 'adverse benefit determination', 'claimant', '180 days', 'claims procedures'],
    citation_format: '29 CFR § 2560.503-1(h)',
    last_updated: '2024-01-15',
    reliability_score: 100
  },

  // CMS REGULATIONS
  {
    id: 'cms_ncd_001',
    authority: 'CMS',
    source: 'Medicare NCD 210.2',
    section: 'Section A',
    title: 'Screening Mammography Coverage',
    content: 'Medicare covers annual screening mammograms for women age 40 and older, and baseline mammograms for women age 35-39 who are at high risk for breast cancer. No deductible applies to the screening mammography benefit.',
    effective_date: '2022-01-01',
    url: 'https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=96',
    tags: ['preventive_care', 'mammography', 'screening', 'medicare', 'women_health'],
    relevance_keywords: ['mammography', 'screening', 'breast cancer', 'women', 'deductible', 'annual'],
    citation_format: 'Medicare NCD 210.2',
    last_updated: '2024-01-15',
    reliability_score: 98
  },
  {
    id: 'cms_manual_001',
    authority: 'CMS',
    source: 'Medicare Claims Processing Manual',
    section: 'Chapter 1, Section 30.6',
    title: 'Medical Necessity Determinations',
    content: 'Services must be reasonable and necessary for the diagnosis or treatment of illness or injury or to improve the functioning of a malformed body member. The determination of whether services are reasonable and necessary is made on a case-by-case basis.',
    effective_date: '2023-01-01',
    url: 'https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/Downloads/clm104c01.pdf',
    tags: ['medical_necessity', 'reasonable', 'diagnosis', 'treatment'],
    relevance_keywords: ['medical necessity', 'reasonable and necessary', 'diagnosis', 'treatment', 'case-by-case'],
    citation_format: 'Medicare Claims Processing Manual, Ch. 1, § 30.6',
    last_updated: '2024-01-15',
    reliability_score: 98
  },

  // STATE REGULATIONS (Examples for different states)
  {
    id: 'state_ca_001',
    authority: 'State',
    source: 'California Insurance Code Section 10133.3',
    title: 'California Balance Billing Protections',
    content: 'A health care service plan contract or health insurance policy shall not impose cost sharing in an amount that exceeds the cost sharing that would be imposed if the services were provided by a contracting provider.',
    effective_date: '2017-01-01',
    url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=10133.3',
    jurisdiction: 'CA',
    tags: ['balance_billing', 'cost_sharing', 'contracting_provider', 'california'],
    relevance_keywords: ['balance billing', 'cost sharing', 'contracting provider', 'out-of-network'],
    citation_format: 'Cal. Ins. Code § 10133.3',
    last_updated: '2024-01-15',
    reliability_score: 95
  },
  {
    id: 'state_ny_001',
    authority: 'State',
    source: 'New York Insurance Law Section 3216',
    title: 'New York Surprise Billing Protections',
    content: 'An insurer shall not impose cost-sharing requirements for emergency services that exceed the cost-sharing requirements that would have been imposed if such services had been provided by a participating provider.',
    effective_date: '2015-03-31',
    url: 'https://www.nysenate.gov/legislation/laws/ISC/3216',
    jurisdiction: 'NY',
    tags: ['surprise_billing', 'emergency_services', 'cost_sharing', 'new_york'],
    relevance_keywords: ['emergency services', 'cost-sharing', 'participating provider', 'insurer'],
    citation_format: 'N.Y. Ins. Law § 3216',
    last_updated: '2024-01-15',
    reliability_score: 95
  },

  // PAYER POLICIES (Examples)
  {
    id: 'payer_aetna_001',
    authority: 'Payer_Policy',
    source: 'Aetna Clinical Policy Bulletin',
    section: 'CPB 0001',
    title: 'Prior Authorization Requirements for Advanced Imaging',
    content: 'Prior authorization is required for CT, MRI, PET, and nuclear medicine studies when performed in outpatient settings. Emergency and inpatient services are exempt from prior authorization requirements.',
    effective_date: '2024-01-01',
    url: 'https://www.aetna.com/health-care-professionals/clinical-policy-bulletins.html',
    tags: ['prior_authorization', 'advanced_imaging', 'outpatient', 'emergency_exempt'],
    relevance_keywords: ['prior authorization', 'CT', 'MRI', 'PET', 'nuclear medicine', 'outpatient', 'emergency'],
    citation_format: 'Aetna Clinical Policy Bulletin CPB 0001',
    last_updated: '2024-01-15',
    reliability_score: 85
  },

  // PROFESSIONAL ASSOCIATION GUIDELINES
  {
    id: 'prof_ama_001',
    authority: 'Professional_Association',
    source: 'AMA CPT Guidelines',
    section: 'Appendix A',
    title: 'Modifiers for Billing Accuracy',
    content: 'Modifiers provide the means to report or indicate that a service or procedure has been altered by some specific circumstance but not changed in its definition or code.',
    effective_date: '2024-01-01',
    url: 'https://www.ama-assn.org/practice-management/cpt/cpt-overview-and-code-approval',
    tags: ['cpt_codes', 'modifiers', 'billing_accuracy', 'procedures'],
    relevance_keywords: ['modifiers', 'service', 'procedure', 'altered', 'circumstance', 'billing'],
    citation_format: 'AMA CPT Guidelines, Appendix A',
    last_updated: '2024-01-15',
    reliability_score: 90
  }
]

/**
 * Advanced Knowledge Retrieval System
 */
export class AuthoritativeKnowledgeRetriever {

  /**
   * Retrieve relevant authoritative sources based on intent and entities
   */
  static async retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult> {
    const startTime = Date.now()
    const maxResults = request.max_results || 10

    console.log(`🔍 Knowledge retrieval for: ${request.intent} (${request.taxonomy_code})`)

    // Score sources based on relevance
    const scoredSources = AUTHORITATIVE_SOURCES.map(source => ({
      source,
      score: this.calculateRelevanceScore(source, request)
    }))

    // Filter and sort by relevance
    const relevantSources = scoredSources
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)

    const sources = relevantSources.map(item => item.source)
    const relevanceScores = relevantSources.reduce((acc, item) => {
      acc[item.source.id] = item.score
      return acc
    }, {} as Record<string, number>)

    const searchTime = Date.now() - startTime

    console.log(`📚 Retrieved ${sources.length} sources in ${searchTime}ms`)
    console.log(`   Top sources:`, sources.slice(0, 3).map(s => `${s.authority}: ${s.title}`))

    return {
      sources,
      total_found: relevantSources.length,
      search_time_ms: searchTime,
      relevance_scores: relevanceScores
    }
  }

  /**
   * Calculate relevance score for a source based on the request
   */
  private static calculateRelevanceScore(
    source: AuthoritativeSource,
    request: KnowledgeRetrievalRequest
  ): number {
    let score = 0

    // Authority weight (Federal regulations get highest priority)
    const authorityWeights = {
      'Federal': 100,
      'CMS': 90,
      'State': 80,
      'Payer_Policy': 70,
      'Professional_Association': 60
    }
    score += authorityWeights[source.authority] || 50

    // Intent matching
    const intentKeywords = this.getIntentKeywords(request.intent)
    for (const keyword of intentKeywords) {
      if (source.relevance_keywords.some(k => k.toLowerCase().includes(keyword.toLowerCase()))) {
        score += 20
      }
      if (source.tags.some(tag => tag.toLowerCase().includes(keyword.toLowerCase()))) {
        score += 15
      }
      if (source.content.toLowerCase().includes(keyword.toLowerCase())) {
        score += 10
      }
    }

    // Taxonomy code specific bonuses
    if (this.isTaxonomyRelevant(source, request.taxonomy_code)) {
      score += 30
    }

    // Entity matching (state, payer, etc.)
    if (request.entities?.state && source.jurisdiction === request.entities.state) {
      score += 25
    }

    if (request.entities?.payer && source.content.toLowerCase().includes(request.entities.payer.toLowerCase())) {
      score += 15
    }

    // Search terms matching
    for (const term of request.search_terms || []) {
      if (source.relevance_keywords.some(k => k.toLowerCase().includes(term.toLowerCase()))) {
        score += 12
      }
      if (source.content.toLowerCase().includes(term.toLowerCase())) {
        score += 8
      }
    }

    // Reliability score boost
    score += source.reliability_score * 0.1

    // Recency bonus (newer regulations get slight preference)
    const sourceDate = new Date(source.effective_date)
    const daysSinceEffective = (Date.now() - sourceDate.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceEffective < 365) {
      score += 5
    }

    return Math.min(Math.round(score), 100)
  }

  /**
   * Get keywords associated with specific intents
   */
  private static getIntentKeywords(intent: string): string[] {
    const intentKeywordMap: Record<string, string[]> = {
      'BILLING_ERRORS': ['billing', 'code', 'duplicate', 'incorrect', 'error', 'cpt', 'hcpcs'],
      'INSURANCE_DENIALS': ['denial', 'denied', 'appeal', 'coverage', 'medical necessity', 'prior authorization'],
      'SURPRISE_BILLING': ['surprise billing', 'balance billing', 'out-of-network', 'emergency', 'ancillary'],
      'PREVENTIVE_CARE': ['preventive', 'screening', 'wellness', 'cost-sharing', 'deductible'],
      'PRIOR_AUTHORIZATION': ['prior authorization', 'preauth', 'approval', 'timely'],
      'COORDINATION_OF_BENEFITS': ['primary', 'secondary', 'coordination', 'multiple insurance'],
      'CLAIM_PROCESSING': ['claim', 'processing', 'filing', 'deadline', 'timely filing'],
      'PROVIDER_NETWORK': ['network', 'provider', 'participating', 'directory'],
      'PHARMACY_BENEFITS': ['pharmacy', 'drug', 'prescription', 'formulary'],
      'MENTAL_HEALTH': ['mental health', 'behavioral', 'therapy', 'parity'],
      'EMERGENCY_SERVICES': ['emergency', 'urgent care', 'er', 'ambulance'],
      'MEDICARE_MEDICAID': ['medicare', 'medicaid', 'cms', 'government'],
      'COBRA_CONTINUATION': ['cobra', 'continuation', 'qualifying event', 'job loss'],
      'APPEALS_GRIEVANCES': ['appeal', 'grievance', 'dispute', 'complaint'],
      'PATIENT_RIGHTS': ['patient rights', 'protection', 'violation', 'balance billing']
    }

    return intentKeywordMap[intent] || ['healthcare', 'insurance', 'billing']
  }

  /**
   * Check if source is relevant to specific taxonomy code
   */
  private static isTaxonomyRelevant(source: AuthoritativeSource, taxonomyCode: string): boolean {
    const taxonomyRelevanceMap: Record<string, string[]> = {
      'B001': ['cpt', 'procedure code', 'coding', 'hcpcs'],
      'B002': ['duplicate', 'multiple claims', 'same service'],
      'I001': ['prior authorization', 'preauth', 'approval'],
      'I002': ['medical necessity', 'reasonable and necessary'],
      'S001': ['emergency services', 'surprise billing', 'out-of-network'],
      'S002': ['ancillary services', 'participating facility'],
      'P001': ['wellness visit', 'preventive care', 'annual exam'],
      'P002': ['screening', 'diagnostic', 'preventive services']
    }

    const relevantTerms = taxonomyRelevanceMap[taxonomyCode] || []
    return relevantTerms.some(term =>
      source.relevance_keywords.some(keyword => keyword.toLowerCase().includes(term.toLowerCase())) ||
      source.content.toLowerCase().includes(term.toLowerCase())
    )
  }

  /**
   * Get sources by jurisdiction (for state-specific queries)
   */
  static getByJurisdiction(state: string): AuthoritativeSource[] {
    return AUTHORITATIVE_SOURCES.filter(source =>
      source.jurisdiction === state || source.authority === 'Federal'
    )
  }

  /**
   * Get sources by authority type
   */
  static getByAuthority(authority: AuthoritativeSource['authority']): AuthoritativeSource[] {
    return AUTHORITATIVE_SOURCES.filter(source => source.authority === authority)
  }

  /**
   * Search sources by text query
   */
  static textSearch(query: string, maxResults: number = 10): AuthoritativeSource[] {
    const queryLower = query.toLowerCase()

    const matches = AUTHORITATIVE_SOURCES
      .filter(source =>
        source.content.toLowerCase().includes(queryLower) ||
        source.title.toLowerCase().includes(queryLower) ||
        source.relevance_keywords.some(keyword => keyword.toLowerCase().includes(queryLower))
      )
      .sort((a, b) => b.reliability_score - a.reliability_score)
      .slice(0, maxResults)

    return matches
  }
}