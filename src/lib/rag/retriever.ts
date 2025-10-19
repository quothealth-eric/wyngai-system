/**
 * WyngAI Central Assistant - RAG Retriever
 * Hybrid retrieval system combining semantic search with keyword filtering
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import {
  RAGQuery,
  RetrievalResult,
  ScoredSection,
  DocumentSection,
  DocumentMetadata,
  ExtractedEntities
} from '@/lib/types/rag';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export class RAGRetriever {
  private maxChunksPerAuthority: number;
  private authorityTiers: string[][];

  constructor(maxChunksPerAuthority = 5) {
    this.maxChunksPerAuthority = maxChunksPerAuthority;

    // Authority hierarchy for prioritized retrieval
    this.authorityTiers = [
      ['federal'],                    // Tier 1: Federal regulations (highest authority)
      ['cms'],                       // Tier 2: CMS guidance and manuals
      ['state_doi'],                 // Tier 3: State DOI regulations
      ['payer'],                     // Tier 4: Payer policies
      ['marketplace'],               // Tier 5: Healthcare.gov guidance
      ['transparency']               // Tier 6: Price transparency data
    ];
  }

  /**
   * Main retrieval method - combines semantic search with authority tiering
   */
  async retrieve(query: RAGQuery): Promise<RetrievalResult> {
    console.log('🔍 Starting RAG retrieval for query:', query.text.substring(0, 100));

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query.text);

    // Perform tiered retrieval across authorities
    const tierResults = await Promise.all(
      this.authorityTiers.map(authorities =>
        this.retrieveFromAuthorities(query, queryEmbedding, authorities)
      )
    );

    // Combine and rank results
    const allSections = tierResults.flat();
    const rankedSections = this.rankSections(allSections, query);

    // Ensure minimum federal/CMS coverage
    const finalSections = this.ensureAuthorityBalance(rankedSections, query);

    const authoritiesUsed = [...new Set(finalSections.map(s => s.document.authority))];

    console.log(`✅ Retrieved ${finalSections.length} sections from authorities: ${authoritiesUsed.join(', ')}`);

    return {
      sections: finalSections,
      authorities_used: authoritiesUsed,
      query_embedding: queryEmbedding,
      total_results: allSections.length
    };
  }

  /**
   * Retrieve sections from specific authorities using hybrid search
   */
  private async retrieveFromAuthorities(
    query: RAGQuery,
    queryEmbedding: number[],
    authorities: string[]
  ): Promise<ScoredSection[]> {
    const maxResults = query.max_chunks_per_authority || this.maxChunksPerAuthority;

    try {
      // Build the query with authority filter
      let supabaseQuery = supabase
        .from('sections')
        .select(`
          *,
          documents!inner(*)
        `)
        .in('documents.authority', authorities)
        .limit(maxResults * 2); // Get more for reranking

      // Add state/jurisdiction filter if available
      if (query.entities.state) {
        supabaseQuery = supabaseQuery.or(
          `documents.jurisdiction.eq.${query.entities.state},documents.jurisdiction.is.null`
        );
      }

      // Add payer filter if available from context
      if (query.context.planInputs?.planName) {
        supabaseQuery = supabaseQuery.or(
          `documents.payer.ilike.%${query.context.planInputs.planName}%,documents.payer.is.null`
        );
      }

      // Semantic search using pgvector - note: requires match_sections function in database
      let semanticResults: any[] = [];
      try {
        const { data, error: semanticError } = await supabase
          .rpc('match_sections', {
            query_embedding: queryEmbedding,
            match_threshold: 0.7,
            match_count: maxResults
          });

        if (!semanticError && data) {
          semanticResults = data;
        } else {
          console.warn('Semantic search via RPC failed:', semanticError);
        }
      } catch (rpcError) {
        console.warn('RPC match_sections not available, falling back to basic search');
      }

      // Remove the old error handling since it's now handled above

      // Keyword search fallback
      const keywordResults = await this.performKeywordSearch(query, authorities, maxResults);

      // Combine and deduplicate results
      const combinedResults = this.combineSearchResults(
        semanticResults || [],
        keywordResults,
        queryEmbedding
      );

      return combinedResults.slice(0, maxResults);

    } catch (error) {
      console.error(`Error retrieving from authorities ${authorities.join(', ')}:`, error);
      return [];
    }
  }

  /**
   * Perform keyword-based search as fallback or supplement
   */
  private async performKeywordSearch(
    query: RAGQuery,
    authorities: string[],
    maxResults: number
  ): Promise<any[]> {
    const keywords = this.extractKeywords(query);

    if (keywords.length === 0) return [];

    const searchTerms = keywords.join(' | ');

    const { data, error } = await supabase
      .from('sections')
      .select(`
        *,
        documents!inner(*)
      `)
      .in('documents.authority', authorities)
      .textSearch('text', searchTerms)
      .limit(maxResults);

    if (error) {
      console.warn('Keyword search failed:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Extract relevant keywords from query for text search
   */
  private extractKeywords(query: RAGQuery): string[] {
    const keywords: string[] = [];

    // Add explicit keywords from entities
    if (query.entities.keywords) {
      keywords.push(...query.entities.keywords);
    }

    // Add medical codes
    if (query.entities.cpt_codes) {
      keywords.push(...query.entities.cpt_codes);
    }
    if (query.entities.hcpcs_codes) {
      keywords.push(...query.entities.hcpcs_codes);
    }

    // Add plan type
    if (query.entities.planType) {
      keywords.push(query.entities.planType);
    }

    // Extract important terms from query text
    const importantTerms = this.extractImportantTerms(query.text);
    keywords.push(...importantTerms);

    return [...new Set(keywords)]; // Deduplicate
  }

  /**
   * Extract important terms from query text using simple heuristics
   */
  private extractImportantTerms(text: string): string[] {
    const terms: string[] = [];

    // Common insurance terms to look for
    const insuranceTerms = [
      'deductible', 'coinsurance', 'copay', 'out-of-pocket', 'prior authorization',
      'referral', 'network', 'emergency', 'appeal', 'external review', 'NSA',
      'surprise billing', 'COBRA', 'marketplace', 'enrollment', 'formulary',
      'step therapy', 'EOB', 'explanation of benefits', 'claim', 'denial'
    ];

    const lowerText = text.toLowerCase();

    for (const term of insuranceTerms) {
      if (lowerText.includes(term.toLowerCase())) {
        terms.push(term);
      }
    }

    return terms;
  }

  /**
   * Combine semantic and keyword search results
   */
  private combineSearchResults(
    semanticResults: any[],
    keywordResults: any[],
    queryEmbedding: number[]
  ): ScoredSection[] {
    const combined = new Map<string, ScoredSection>();

    // Process semantic results
    for (const result of semanticResults) {
      const section = result.sections || result;
      const document = result.documents || result.documents;

      combined.set(section.section_id, {
        section,
        document,
        score: result.similarity || 0.8, // Default if similarity not provided
        match_type: 'semantic'
      });
    }

    // Process keyword results
    for (const result of keywordResults) {
      const section = result.sections || result;
      const document = result.documents || result.documents;
      const sectionId = section.section_id;

      if (combined.has(sectionId)) {
        // Boost score for hybrid matches
        const existing = combined.get(sectionId)!;
        existing.score = Math.min(existing.score + 0.1, 1.0);
        existing.match_type = 'hybrid';
      } else {
        // Calculate semantic similarity for keyword-only results
        const similarity = section.embedding
          ? this.calculateCosineSimilarity(queryEmbedding, section.embedding)
          : 0.6; // Default score for keyword matches without embeddings

        combined.set(sectionId, {
          section,
          document,
          score: similarity,
          match_type: 'keyword'
        });
      }
    }

    return Array.from(combined.values());
  }

  /**
   * Rank sections based on multiple factors
   */
  private rankSections(sections: ScoredSection[], query: RAGQuery): ScoredSection[] {
    return sections
      .map(section => ({
        ...section,
        score: this.calculateFinalScore(section, query)
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate final score considering multiple factors
   */
  private calculateFinalScore(section: ScoredSection, query: RAGQuery): number {
    let score = section.score;

    // Authority boost
    const authorityBoost = this.getAuthorityBoost(section.document.authority);
    score *= (1 + authorityBoost);

    // Recency boost for time-sensitive content
    if (section.document.eff_date) {
      const effDate = new Date(section.document.eff_date);
      const monthsOld = (Date.now() - effDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      const recencyBoost = Math.max(0, 1 - monthsOld / 60); // Decay over 5 years
      score *= (1 + recencyBoost * 0.1);
    }

    // State relevance boost
    if (query.entities.state && section.document.jurisdiction === query.entities.state) {
      score *= 1.2;
    }

    // Plan type relevance boost
    if (query.entities.planType && section.section.text.toLowerCase().includes(query.entities.planType.toLowerCase())) {
      score *= 1.1;
    }

    return score;
  }

  /**
   * Get authority-based score boost
   */
  private getAuthorityBoost(authority: string): number {
    const boosts: Record<string, number> = {
      'federal': 0.3,
      'cms': 0.25,
      'state_doi': 0.2,
      'payer': 0.15,
      'marketplace': 0.1,
      'transparency': 0.05
    };
    return boosts[authority] || 0;
  }

  /**
   * Ensure balanced authority representation, prioritizing federal/CMS
   */
  private ensureAuthorityBalance(sections: ScoredSection[], query: RAGQuery): ScoredSection[] {
    const result: ScoredSection[] = [];
    const authorityCount: Record<string, number> = {};

    // First pass: add high-scoring sections up to limits
    for (const section of sections) {
      const authority = section.document.authority;
      const currentCount = authorityCount[authority] || 0;

      if (currentCount < this.maxChunksPerAuthority) {
        result.push(section);
        authorityCount[authority] = currentCount + 1;
      }

      if (result.length >= 20) break; // Overall limit
    }

    // Ensure at least one federal or CMS source for regulatory questions
    const hasFederalOrCMS = result.some(s =>
      s.document.authority === 'federal' || s.document.authority === 'cms'
    );

    if (!hasFederalOrCMS && this.isRegulatoryQuery(query)) {
      // Find best federal/CMS section and add it
      const federalCMSSections = sections.filter(s =>
        s.document.authority === 'federal' || s.document.authority === 'cms'
      );

      if (federalCMSSections.length > 0) {
        result.unshift(federalCMSSections[0]); // Add to beginning
        if (result.length > 20) result.pop(); // Maintain limit
      }
    }

    return result;
  }

  /**
   * Determine if query requires regulatory/federal authority
   */
  private isRegulatoryQuery(query: RAGQuery): boolean {
    const regulatoryKeywords = [
      'NSA', 'No Surprises Act', 'federal', 'regulation', 'law', 'required',
      'mandate', 'compliance', 'appeal', 'external review', 'timeline',
      'emergency', 'surprise billing', 'COBRA', 'HIPAA', 'ACA'
    ];

    const queryText = query.text.toLowerCase();
    return regulatoryKeywords.some(keyword => queryText.includes(keyword.toLowerCase()));
  }

  /**
   * Generate embedding for query text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text.trim(),
        dimensions: 1536
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate query embedding');
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Create a PostgreSQL function for vector similarity search
 * This should be run as a migration to enable the match_sections RPC
 */
export const MATCH_SECTIONS_SQL = `
CREATE OR REPLACE FUNCTION match_sections(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  section_id uuid,
  doc_id uuid,
  section_path text,
  title text,
  text text,
  tokens int,
  eff_date date,
  version text,
  similarity float,
  documents jsonb
)
LANGUAGE sql STABLE
AS $$
  SELECT
    s.section_id,
    s.doc_id,
    s.section_path,
    s.title,
    s.text,
    s.tokens,
    s.eff_date,
    s.version,
    1 - (s.embedding <=> query_embedding) AS similarity,
    row_to_json(d.*) AS documents
  FROM sections s
  JOIN documents d ON s.doc_id = d.doc_id
  WHERE 1 - (s.embedding <=> query_embedding) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
$$;
`;