/**
 * Unified RAG Search Pipeline for WyngAI Search Platform
 *
 * This module provides a unified search interface that can query across:
 * - Health insurance knowledge base (documents, Q&A corpus)
 * - Congressional legislation (bills, summaries)
 * - Existing healthcare regulation index
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  source_type: 'insurance' | 'legislation' | 'qa_corpus' | 'regulation';
  authority: string;
  authority_rank: number;
  url?: string;
  metadata: Record<string, any>;
  similarity: number;
  section_path?: string[];
  bill_id?: string;
  citations?: string[];
}

export interface SearchFilters {
  source_types?: Array<'insurance' | 'legislation' | 'qa_corpus' | 'regulation'>;
  authorities?: string[];
  min_authority_rank?: number;
  state_specific?: string;
  bill_id?: string;
  categories?: string[];
  max_results?: number;
}

export interface UnifiedSearchResponse {
  results: SearchResult[];
  total_found: number;
  query_embedding_time: number;
  search_time: number;
  authority_mix: Record<string, number>;
  source_distribution: Record<string, number>;
}

async function generateQueryEmbedding(query: string): Promise<number[]> {
  const startTime = Date.now();

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: query,
      dimensions: 1536
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Failed to generate query embedding:', error);
    throw new Error('Failed to generate query embedding');
  }
}

export async function searchInsurance(
  query: string,
  filters: SearchFilters = {}
): Promise<UnifiedSearchResponse> {
  const startTime = Date.now();
  const {
    max_results = 10,
    min_authority_rank = 0.5,
    authorities,
    state_specific,
    categories
  } = filters;

  try {
    // Generate query embedding
    const embeddingStartTime = Date.now();
    const queryEmbedding = await generateQueryEmbedding(query);
    const embeddingTime = Date.now() - embeddingStartTime;

    const results: SearchResult[] = [];

    // Search documents/sections
    const documentsQuery = supabase.rpc('search_insurance_knowledge', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.7,
      match_count: Math.ceil(max_results * 0.6) // 60% from documents
    });

    // Search Q&A corpus
    const qaQuery = supabase.rpc('search_qa_corpus', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.75,
      match_count: Math.ceil(max_results * 0.4) // 40% from Q&A
    });

    const [documentsResult, qaResult] = await Promise.all([
      documentsQuery,
      qaQuery
    ]);

    // Process document results
    if (documentsResult.data) {
      for (const row of documentsResult.data) {
        if (authorities && !authorities.includes(row.authority)) continue;
        if (row.authority_rank < min_authority_rank) continue;

        results.push({
          id: row.section_id,
          title: row.document_title,
          content: row.content,
          source_type: 'insurance',
          authority: row.authority,
          authority_rank: row.authority_rank,
          metadata: { section_path: row.section_path },
          similarity: row.similarity,
          section_path: row.section_path
        });
      }
    }

    // Process Q&A results
    if (qaResult.data) {
      for (const row of qaResult.data) {
        if (categories && !categories.some(cat => row.category === cat)) continue;
        if (state_specific && row.state_specific && row.state_specific !== state_specific) continue;
        if (row.authority_rank < min_authority_rank) continue;

        results.push({
          id: row.qa_id,
          title: `Q: ${row.question}`,
          content: row.answer,
          source_type: 'qa_corpus',
          authority: 'WyngAI Corpus',
          authority_rank: row.authority_rank,
          metadata: {
            question: row.question,
            category: row.category,
            themes: row.themes
          },
          similarity: row.similarity
        });
      }
    }

    // Sort by authority rank and similarity
    results.sort((a, b) => {
      const authorityDiff = b.authority_rank - a.authority_rank;
      if (Math.abs(authorityDiff) > 0.1) return authorityDiff;
      return b.similarity - a.similarity;
    });

    const finalResults = results.slice(0, max_results);
    const searchTime = Date.now() - startTime;

    // Calculate distributions
    const authorityMix: Record<string, number> = {};
    const sourceDistribution: Record<string, number> = {};

    finalResults.forEach(result => {
      authorityMix[result.authority] = (authorityMix[result.authority] || 0) + 1;
      sourceDistribution[result.source_type] = (sourceDistribution[result.source_type] || 0) + 1;
    });

    return {
      results: finalResults,
      total_found: results.length,
      query_embedding_time: embeddingTime,
      search_time: searchTime,
      authority_mix: authorityMix,
      source_distribution: sourceDistribution
    };

  } catch (error) {
    console.error('Insurance search failed:', error);
    throw error;
  }
}

export async function searchLegislation(
  query: string,
  filters: SearchFilters = {}
): Promise<UnifiedSearchResponse> {
  const startTime = Date.now();
  const {
    max_results = 5,
    bill_id
  } = filters;

  try {
    // Generate query embedding
    const embeddingStartTime = Date.now();
    const queryEmbedding = await generateQueryEmbedding(query);
    const embeddingTime = Date.now() - embeddingStartTime;

    let legislationQuery = supabase.rpc('search_legislation', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.7,
      match_count: max_results
    });

    // Add bill_id filter if specified
    if (bill_id) {
      legislationQuery = legislationQuery.eq('bill_id', bill_id);
    }

    const { data: legislationData, error } = await legislationQuery;

    if (error) {
      console.error('Legislation search error:', error);
      throw error;
    }

    const results: SearchResult[] = [];

    if (legislationData) {
      for (const row of legislationData) {
        results.push({
          id: row.section_id,
          title: row.bill_title,
          content: row.content,
          source_type: 'legislation',
          authority: 'Congress.gov',
          authority_rank: 0.95,
          url: `https://congress.gov/bill/${row.bill_id.split('-')[0]}/${row.bill_id.split('-')[1].toLowerCase()}/${row.bill_id.split('-')[2]}`,
          metadata: {
            bill_id: row.bill_id,
            section_path: row.section_path
          },
          similarity: row.similarity,
          bill_id: row.bill_id,
          section_path: [row.section_path]
        });
      }
    }

    const searchTime = Date.now() - startTime;

    return {
      results,
      total_found: results.length,
      query_embedding_time: embeddingTime,
      search_time: searchTime,
      authority_mix: { 'Congress.gov': results.length },
      source_distribution: { 'legislation': results.length }
    };

  } catch (error) {
    console.error('Legislation search failed:', error);
    throw error;
  }
}

export async function searchUnified(
  query: string,
  mode: 'insurance' | 'legislation' | 'mixed' = 'mixed',
  filters: SearchFilters = {}
): Promise<UnifiedSearchResponse> {
  const startTime = Date.now();
  const { max_results = 10 } = filters;

  try {
    let results: SearchResult[] = [];
    let embeddingTime = 0;
    let authorityMix: Record<string, number> = {};
    let sourceDistribution: Record<string, number> = {};

    if (mode === 'insurance' || mode === 'mixed') {
      const insuranceResults = await searchInsurance(query, {
        ...filters,
        max_results: mode === 'mixed' ? Math.ceil(max_results * 0.7) : max_results
      });

      results.push(...insuranceResults.results);
      embeddingTime = insuranceResults.query_embedding_time;

      Object.entries(insuranceResults.authority_mix).forEach(([auth, count]) => {
        authorityMix[auth] = (authorityMix[auth] || 0) + count;
      });

      Object.entries(insuranceResults.source_distribution).forEach(([source, count]) => {
        sourceDistribution[source] = (sourceDistribution[source] || 0) + count;
      });
    }

    if (mode === 'legislation' || mode === 'mixed') {
      const legislationResults = await searchLegislation(query, {
        ...filters,
        max_results: mode === 'mixed' ? Math.ceil(max_results * 0.3) : max_results
      });

      results.push(...legislationResults.results);
      if (embeddingTime === 0) embeddingTime = legislationResults.query_embedding_time;

      Object.entries(legislationResults.authority_mix).forEach(([auth, count]) => {
        authorityMix[auth] = (authorityMix[auth] || 0) + count;
      });

      Object.entries(legislationResults.source_distribution).forEach(([source, count]) => {
        sourceDistribution[source] = (sourceDistribution[source] || 0) + count;
      });
    }

    // Sort combined results by authority rank and similarity
    if (mode === 'mixed') {
      results.sort((a, b) => {
        // Prioritize federal/CMS sources when available
        const aIsFederal = ['CMS', 'HealthCare.gov', 'Medicare.gov', 'Congress.gov'].includes(a.authority);
        const bIsFederal = ['CMS', 'HealthCare.gov', 'Medicare.gov', 'Congress.gov'].includes(b.authority);

        if (aIsFederal !== bIsFederal) {
          return bIsFederal ? 1 : -1;
        }

        const authorityDiff = b.authority_rank - a.authority_rank;
        if (Math.abs(authorityDiff) > 0.1) return authorityDiff;
        return b.similarity - a.similarity;
      });
    }

    const finalResults = results.slice(0, max_results);
    const searchTime = Date.now() - startTime;

    return {
      results: finalResults,
      total_found: results.length,
      query_embedding_time: embeddingTime,
      search_time: searchTime,
      authority_mix: authorityMix,
      source_distribution: sourceDistribution
    };

  } catch (error) {
    console.error('Unified search failed:', error);
    throw error;
  }
}

export async function getBillMetadata(billId: string): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('leg_bills')
      .select('*')
      .eq('bill_id', billId)
      .single();

    if (error) {
      console.error('Failed to fetch bill metadata:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Bill metadata fetch error:', error);
    return null;
  }
}

export async function getRecentLegislation(limit: number = 5): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('leg_bills')
      .select('bill_id, title, introduced_date, latest_action, latest_action_date, url')
      .order('latest_action_date', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch recent legislation:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Recent legislation fetch error:', error);
    return [];
  }
}

// Analytics helpers
export async function logSearchAnalytics(
  userId: string | null,
  query: string,
  mode: string,
  results: SearchResult[],
  searchTime: number
): Promise<void> {
  try {
    const sourcesUsed = Array.from(new Set(results.map(r => r.authority)));
    const avgConfidence = results.length > 0
      ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length
      : 0;

    await supabase.from('search_analytics').insert({
      user_id: userId,
      query,
      query_mode: mode,
      results_count: results.length,
      confidence_score: avgConfidence,
      sources_used: sourcesUsed
    });
  } catch (error) {
    console.error('Failed to log search analytics:', error);
    // Don't throw - analytics failure shouldn't break search
  }
}