/**
 * WyngAI Unified Search API
 *
 * This is the main search endpoint for the WyngAI Search platform.
 * It provides unified search across health insurance knowledge, congressional legislation,
 * and existing healthcare regulation with intelligent intent routing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { IntentRouter, QueryContext } from '@/lib/intent/router';
import { searchUnified, logSearchAnalytics } from '@/lib/rag/unified';
import { composeAnswer } from '@/lib/compose';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

// Route configuration
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const {
      query,
      mode,
      threadId,
      userId,
      files = [],
      max_results = 10
    } = body;

    console.log('🔍 WyngAI Search Request:', {
      query: query?.substring(0, 100),
      mode,
      filesCount: files.length,
      threadId,
      userId
    });

    // Validate required fields
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query parameter is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Step 1: Intent Classification
    const intentRouter = new IntentRouter();
    const queryContext: QueryContext = {
      query,
      files,
      user_state: undefined, // Could extract from user profile
      conversation_history: []
    };

    const intentResult = await intentRouter.classifyIntent(queryContext);

    console.log('🎯 Intent Classification:', {
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      suggested_mode: intentResult.suggested_mode,
      reasoning: intentResult.reasoning
    });

    // Step 2: Determine search mode
    let searchMode: 'insurance' | 'legislation' | 'mixed' = 'insurance';

    if (mode) {
      // User explicitly specified mode via UI tabs
      searchMode = mode;
    } else if (intentResult.confidence > 0.7) {
      // High confidence intent classification
      searchMode = intentResult.suggested_mode;
    } else {
      // Default based on patterns
      if (intentRouter.shouldSwitchToLegislationMode(query)) {
        searchMode = 'legislation';
      } else {
        searchMode = 'insurance';
      }
    }

    console.log(`🔄 Using search mode: ${searchMode}`);

    // Step 3: Extract contextual information
    const billReferences = intentRouter.extractBillReferences(query);
    const stateReference = intentRouter.extractStateReferences(query);

    console.log('📝 Extracted context:', {
      billReferences,
      stateReference
    });

    // Step 4: Perform unified search
    const searchFilters = {
      max_results,
      bill_id: billReferences.length > 0 ? billReferences[0] : undefined,
      state_specific: stateReference,
      source_types: searchMode === 'insurance'
        ? ['insurance', 'qa_corpus', 'regulation'] as const
        : searchMode === 'legislation'
        ? ['legislation'] as const
        : undefined
    };

    const searchResults = await searchUnified(query, searchMode, searchFilters);

    console.log('📊 Search Results:', {
      total_found: searchResults.total_found,
      search_time: searchResults.search_time,
      source_distribution: searchResults.source_distribution,
      authority_mix: searchResults.authority_mix
    });

    // Step 5: Compose comprehensive answer
    const composerInput = {
      query,
      search_results: searchResults.results,
      mode: searchMode,
      user_state: stateReference || undefined,
      context_frame: { /* could include user preferences */ }
    };

    const composedAnswer = await composeAnswer(composerInput);

    console.log('✅ Answer composed:', {
      confidence: composedAnswer.confidence,
      citations_count: composedAnswer.citations.length,
      next_steps_count: composedAnswer.next_steps.length,
      themes: composedAnswer.themes.map(t => t.theme)
    });

    // Step 6: Log analytics
    const totalTime = Date.now() - startTime;

    if (userId) {
      await logSearchAnalytics(
        userId,
        query,
        searchMode,
        searchResults.results,
        totalTime
      );
    }

    // Step 7: Store search session if threadId provided
    if (threadId) {
      await storeSearchSession({
        threadId,
        userId,
        query,
        mode: searchMode,
        intent: intentResult,
        results: searchResults,
        answer: composedAnswer,
        metadata: {
          bill_references: billReferences,
          state_reference: stateReference,
          total_time: totalTime
        }
      });
    }

    console.log(`⚡ Total request time: ${totalTime}ms`);

    // Step 8: Return structured response
    return NextResponse.json({
      success: true,
      data: {
        query,
        mode: searchMode,
        intent: intentResult,

        // Main answer content
        summary: composedAnswer.summary,
        answer: composedAnswer.answer,
        confidence: composedAnswer.confidence,

        // Supporting information
        citations: composedAnswer.citations,
        next_steps: composedAnswer.next_steps,
        scripts: composedAnswer.scripts,
        links: composedAnswer.links,

        // Bill metadata for legislation queries
        bill_meta: composedAnswer.bill_meta,

        // Theme analysis
        themes: composedAnswer.themes,

        // Search metadata
        search_metadata: {
          results_found: searchResults.total_found,
          search_time: searchResults.search_time,
          embedding_time: searchResults.query_embedding_time,
          source_distribution: searchResults.source_distribution,
          authority_mix: searchResults.authority_mix
        }
      },

      metadata: {
        total_time: totalTime,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        thread_id: threadId
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('❌ WyngAI Search Error:', error);

    return NextResponse.json(
      {
        error: 'Search request failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          total_time: totalTime,
          timestamp: new Date().toISOString()
        }
      },
      { status: 500 }
    );
  }
}

async function storeSearchSession(data: {
  threadId: string;
  userId?: string;
  query: string;
  mode: string;
  intent: any;
  results: any;
  answer: any;
  metadata: any;
}): Promise<void> {
  try {
    // Store or update chat session
    await supabase
      .from('chat_sessions')
      .upsert({
        chat_id: data.threadId,
        user_id: data.userId,
        title: data.query.substring(0, 100),
        session_type: 'search',
        context_frame: {
          last_query: data.query,
          last_mode: data.mode,
          last_intent: data.intent
        },
        updated_at: new Date()
      });

    // Store the search interaction
    await supabase
      .from('chat_messages')
      .insert([
        {
          chat_session_id: data.threadId,
          role: 'user',
          content: data.query,
          metadata: {
            intent: data.intent,
            mode: data.mode,
            bill_references: data.metadata.bill_references,
            state_reference: data.metadata.state_reference
          }
        },
        {
          chat_session_id: data.threadId,
          role: 'assistant',
          content: data.answer.answer,
          metadata: {
            citations: data.answer.citations,
            next_steps: data.answer.next_steps,
            confidence: data.answer.confidence,
            themes: data.answer.themes,
            search_metadata: data.results,
            processing_time: data.metadata.total_time
          }
        }
      ]);

  } catch (error) {
    console.error('Failed to store search session:', error);
    // Don't throw - session storage failure shouldn't break the search
  }
}

// GET endpoint for API documentation
export async function GET() {
  return NextResponse.json({
    name: 'WyngAI Unified Search API',
    version: '1.0.0',
    description: 'Unified search across health insurance knowledge and congressional legislation',

    endpoints: {
      'POST /api/search': {
        description: 'Main search endpoint',
        parameters: {
          query: 'string (required) - Search query',
          mode: 'string (optional) - Search mode: insurance|legislation|mixed',
          threadId: 'string (optional) - Thread ID for session tracking',
          userId: 'string (optional) - User ID for analytics',
          files: 'array (optional) - Uploaded files for analysis',
          max_results: 'number (optional) - Maximum results to return (default: 10)'
        }
      }
    },

    search_modes: {
      insurance: 'Search health insurance knowledge base and Q&A corpus',
      legislation: 'Search congressional healthcare bills and summaries',
      mixed: 'Search both insurance and legislation sources'
    },

    features: [
      'Intelligent intent classification',
      'RAG search with vector embeddings',
      'Authoritative source citations',
      'Non-partisan bill summaries',
      'Actionable next steps and scripts',
      'User session tracking',
      'Search analytics'
    ],

    data_sources: [
      'CMS healthcare regulations',
      'HealthCare.gov marketplace information',
      'State insurance department guidance',
      'Congress.gov bill text and metadata',
      'Curated health insurance Q&A corpus'
    ]
  });
}