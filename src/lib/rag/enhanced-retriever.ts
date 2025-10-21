/**
 * Enhanced RAG Retriever with Hybrid Search
 * Combines semantic similarity with authority-based ranking
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { ExtractedEntities, RAGQuery, RetrievalResult, ScoredSection, DocumentSection, DocumentMetadata } from '../types/rag'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

interface SearchResult {
  section_id: string
  doc_id: string
  section_path?: string
  title?: string
  text: string
  tokens: number
  eff_date?: string
  version?: string
  similarity: number
  documents: DocumentMetadata
}

export class EnhancedRAGRetriever {
  private readonly authorityWeights: Record<string, number> = {
    'federal': 1.0,      // Highest authority: federal regulations
    'cms': 0.9,          // CMS guidance and manuals
    'state_doi': 0.8,    // State insurance department guidance
    'marketplace': 0.7,  // Healthcare.gov and state marketplace info
    'payer': 0.6,        // Insurance company policies
    'transparency': 0.5  // Price transparency data
  }

  private readonly docTypeWeights: Record<string, number> = {
    'regulation': 1.0,
    'manual': 0.9,
    'ncd': 0.9,         // National Coverage Determination
    'lcd': 0.8,         // Local Coverage Determination
    'policy': 0.7,
    'faq': 0.6,
    'form': 0.5,
    'transparency': 0.4
  }

  /**
   * Main retrieval method with hybrid approach
   */
  async retrieve(query: RAGQuery): Promise<RetrievalResult> {
    const startTime = Date.now()

    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query.text)

      // Perform hybrid search
      const semanticResults = await this.semanticSearch(queryEmbedding, query)
      const keywordResults = await this.keywordSearch(query)

      // Merge and rank results
      const mergedResults = this.mergeResults(semanticResults, keywordResults)

      // Apply authority-based reranking
      const rankedResults = this.applyAuthorityRanking(mergedResults, query.entities)

      // Filter and limit results
      const maxResults = query.max_chunks_per_authority || 10
      const finalResults = this.enforceAuthorityLimits(rankedResults, maxResults)

      console.log(`RAG retrieval completed in ${Date.now() - startTime}ms: ${finalResults.length} results`)

      return {
        sections: finalResults,
        authorities_used: [...new Set(finalResults.map(r => r.document.authority))],
        query_embedding: queryEmbedding,
        total_results: finalResults.length
      }

    } catch (error) {
      console.error('RAG retrieval failed:', error)
      throw error
    }
  }

  /**
   * Generate OpenAI embedding for query
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 1536
      })

      return response.data[0].embedding

    } catch (error) {
      console.error('Failed to generate embedding:', error)
      throw new Error('Embedding generation failed')
    }
  }

  /**
   * Semantic search using vector similarity
   */
  private async semanticSearch(
    queryEmbedding: number[],
    query: RAGQuery,
    threshold: number = 0.7
  ): Promise<SearchResult[]> {
    try {
      // Call the PostgreSQL function for vector similarity search
      const { data, error } = await supabase.rpc('match_sections', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: 50 // Get more candidates for reranking
      })

      if (error) {
        console.error('Semantic search error:', error)
        return []
      }

      return data || []

    } catch (error) {
      console.error('Semantic search failed:', error)
      return []
    }
  }

  /**
   * Keyword-based search using PostgreSQL full-text search
   */
  private async keywordSearch(query: RAGQuery): Promise<SearchResult[]> {
    try {
      // Extract important keywords from entities
      const keywords = this.extractKeywords(query)
      if (keywords.length === 0) return []

      // Build search query
      const searchTerms = keywords.join(' | ')

      const { data, error } = await supabase
        .from('sections')
        .select(`
          section_id,
          doc_id,
          section_path,
          title,
          text,
          tokens,
          eff_date,
          version,
          documents!inner(*)
        `)
        .textSearch('text', searchTerms)
        .limit(30)

      if (error) {
        console.error('Keyword search error:', error)
        return []
      }

      // Convert to SearchResult format with keyword match scores
      return data.map(row => ({
        section_id: row.section_id,
        doc_id: row.doc_id,
        section_path: row.section_path,
        title: row.title,
        text: row.text,
        tokens: row.tokens,
        eff_date: row.eff_date,
        version: row.version,
        similarity: this.calculateKeywordScore(row.text, keywords),
        documents: row.documents as DocumentMetadata
      }))

    } catch (error) {
      console.error('Keyword search failed:', error)
      return []
    }
  }

  /**
   * Extract relevant keywords from query and entities
   */
  private extractKeywords(query: RAGQuery): string[] {
    const keywords: string[] = []

    // Add entity-based keywords
    if (query.entities.planType) {
      keywords.push(query.entities.planType.toLowerCase())
    }

    if (query.entities.state) {
      keywords.push(query.entities.state.toLowerCase())
    }

    if (query.entities.cpt_codes) {
      keywords.push(...query.entities.cpt_codes)
    }

    if (query.entities.hcpcs_codes) {
      keywords.push(...query.entities.hcpcs_codes)
    }

    if (query.entities.keywords) {
      keywords.push(...query.entities.keywords)
    }

    // Extract important terms from query text
    const queryTerms = this.extractImportantTerms(query.text)
    keywords.push(...queryTerms)

    return [...new Set(keywords)] // Remove duplicates
  }

  /**
   * Extract important terms from query text
   */
  private extractImportantTerms(text: string): string[] {
    const importantTerms: string[] = []

    // Medical/insurance terminology
    const medicalTerms = [
      'prior authorization', 'referral', 'deductible', 'coinsurance', 'copay',
      'out of network', 'emergency', 'urgent care', 'specialist', 'primary care',
      'formulary', 'appeal', 'denial', 'claim', 'eob', 'balance billing',
      'surprise billing', 'cobra', 'sep', 'enrollment', 'medicare', 'medicaid'
    ]

    const lowerText = text.toLowerCase()
    for (const term of medicalTerms) {
      if (lowerText.includes(term)) {
        importantTerms.push(term)
      }
    }

    // Extract quoted phrases
    const quotedPhrases = text.match(/"([^"]+)"/g)
    if (quotedPhrases) {
      importantTerms.push(...quotedPhrases.map(phrase => phrase.slice(1, -1)))
    }

    // Extract capitalized terms (likely proper nouns)
    const capitalizedTerms = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)
    if (capitalizedTerms) {
      importantTerms.push(...capitalizedTerms.filter(term => term.length > 3))
    }

    return importantTerms
  }

  /**
   * Calculate keyword relevance score
   */
  private calculateKeywordScore(text: string, keywords: string[]): number {
    const lowerText = text.toLowerCase()
    let score = 0

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase()
      const occurrences = (lowerText.match(new RegExp(lowerKeyword, 'g')) || []).length

      if (occurrences > 0) {
        // Higher score for exact matches, partial credit for partial matches
        score += occurrences * (lowerText.includes(lowerKeyword) ? 1.0 : 0.5)
      }
    }

    // Normalize by text length and keyword count
    return Math.min(score / (keywords.length * (text.length / 1000)), 1.0)
  }

  /**
   * Merge semantic and keyword search results
   */
  private mergeResults(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[]
  ): SearchResult[] {
    const resultMap = new Map<string, SearchResult>()

    // Add semantic results
    for (const result of semanticResults) {
      resultMap.set(result.section_id, {
        ...result,
        similarity: result.similarity * 0.7 // Weight semantic similarity
      })
    }

    // Merge keyword results
    for (const result of keywordResults) {
      const existing = resultMap.get(result.section_id)
      if (existing) {
        // Combine scores
        existing.similarity = Math.max(
          existing.similarity,
          existing.similarity + (result.similarity * 0.3) // Weight keyword score
        )
      } else {
        resultMap.set(result.section_id, {
          ...result,
          similarity: result.similarity * 0.5 // Lower weight for keyword-only
        })
      }
    }

    return Array.from(resultMap.values())
  }

  /**
   * Apply authority-based ranking to results
   */
  private applyAuthorityRanking(
    results: SearchResult[],
    entities: ExtractedEntities
  ): ScoredSection[] {
    return results.map(result => {
      const doc = result.documents

      // Base similarity score
      let finalScore = result.similarity

      // Apply authority weight
      const authorityWeight = this.authorityWeights[doc.authority] || 0.5
      finalScore *= authorityWeight

      // Apply document type weight
      const docTypeWeight = this.docTypeWeights[doc.doc_type] || 0.5
      finalScore *= docTypeWeight

      // Boost for jurisdiction relevance
      if (entities.state && doc.jurisdiction === entities.state) {
        finalScore *= 1.2
      }

      // Boost for recency (prefer more recent documents)
      if (doc.eff_date) {
        const effDate = new Date(doc.eff_date)
        const daysSinceEffective = (Date.now() - effDate.getTime()) / (1000 * 60 * 60 * 24)
        const recencyBoost = Math.max(0.8, 1.0 - (daysSinceEffective / 365) * 0.2)
        finalScore *= recencyBoost
      }

      // Convert to ScoredSection format
      const section: DocumentSection = {
        section_id: result.section_id,
        doc_id: result.doc_id,
        section_path: result.section_path,
        title: result.title,
        text: result.text,
        tokens: result.tokens,
        eff_date: result.eff_date,
        version: result.version,
        created_at: new Date().toISOString()
      }

      return {
        section,
        document: doc,
        score: finalScore,
        match_type: 'hybrid' as const,
        highlighted_text: this.extractHighlight(result.text)
      }

    }).sort((a, b) => b.score - a.score) // Sort by final score descending
  }

  /**
   * Enforce limits per authority to ensure diversity
   */
  private enforceAuthorityLimits(
    results: ScoredSection[],
    maxTotal: number
  ): ScoredSection[] {
    const authorityCountMap = new Map<string, number>()
    const finalResults: ScoredSection[] = []

    // Limits per authority type
    const authorityLimits: Record<string, number> = {
      'federal': Math.ceil(maxTotal * 0.4),     // 40% federal
      'cms': Math.ceil(maxTotal * 0.3),         // 30% CMS
      'state_doi': Math.ceil(maxTotal * 0.2),   // 20% state
      'marketplace': Math.ceil(maxTotal * 0.1), // 10% marketplace
      'payer': Math.ceil(maxTotal * 0.1),       // 10% payer
      'transparency': Math.ceil(maxTotal * 0.05) // 5% transparency
    }

    for (const result of results) {
      if (finalResults.length >= maxTotal) break

      const authority = result.document.authority
      const currentCount = authorityCountMap.get(authority) || 0
      const limit = authorityLimits[authority] || 2

      if (currentCount < limit) {
        finalResults.push(result)
        authorityCountMap.set(authority, currentCount + 1)
      }
    }

    // Ensure we have at least one federal/CMS source when available
    const hasFederal = finalResults.some(r => r.document.authority === 'federal')
    const hasCMS = finalResults.some(r => r.document.authority === 'cms')

    if (!hasFederal && !hasCMS) {
      const federalOrCMS = results.find(r =>
        r.document.authority === 'federal' || r.document.authority === 'cms'
      )
      if (federalOrCMS && finalResults.length > 0) {
        // Replace lowest scoring result with federal/CMS source
        finalResults[finalResults.length - 1] = federalOrCMS
      }
    }

    return finalResults
  }

  /**
   * Extract relevant highlight from section text
   */
  private extractHighlight(text: string, maxLength: number = 200): string {
    if (text.length <= maxLength) return text

    // Try to find a good break point near the beginning
    const firstSentenceEnd = text.indexOf('.', 100)
    if (firstSentenceEnd > 0 && firstSentenceEnd < maxLength) {
      return text.slice(0, firstSentenceEnd + 1) + '...'
    }

    // Fallback: truncate at word boundary
    const truncated = text.slice(0, maxLength)
    const lastSpace = truncated.lastIndexOf(' ')
    return lastSpace > 0 ? truncated.slice(0, lastSpace) + '...' : truncated + '...'
  }
}