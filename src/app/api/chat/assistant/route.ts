/**
 * WyngAI Central Assistant - Enhanced Chat API
 * Multi-turn conversation with RAG, file uploads, and structured responses
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { RAGRetriever } from '@/lib/rag/retriever';
import { QueryUnderstanding } from '@/lib/rag/query-understanding';
import { AnswerComposer } from '@/lib/rag/answer-composer';
import {
  ChatSession,
  ChatMessage,
  ChatContext,
  ChatResponse,
  ExtractedEntities,
  RAGQuery
} from '@/lib/types/rag';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

// Route configuration
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      files = [],
      chatId,
      caseId,
      planInputs,
      userId
    } = body;

    console.log('💬 Processing WyngAI assistant request:', {
      hasText: !!text,
      filesCount: files.length,
      chatId,
      caseId
    });

    // Validate required fields
    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Question text is required' },
        { status: 400 }
      );
    }

    // Initialize services
    const queryUnderstanding = new QueryUnderstanding();
    const retriever = new RAGRetriever();
    const answerComposer = new AnswerComposer();

    // Get or create chat session
    const session = await getOrCreateChatSession(chatId, caseId, userId, planInputs);

    // Process file uploads if any
    let extractedData = null;
    if (files.length > 0) {
      extractedData = await processFileUploads(files, session.chat_id);
    }

    // Extract entities from query
    const entities = await queryUnderstanding.extractEntities(text, session.context_data);

    // Update context with new information
    const updatedContext = queryUnderstanding.updateContext(session.context_data, entities);

    // Check if clarification is needed
    const clarification = queryUnderstanding.shouldClarify(entities, updatedContext);

    if (clarification.needsClarification) {
      // Save user message
      await saveMessage(session.chat_id, 'user', text, 'text', { entities });

      // Return clarification response
      const clarificationResponse: ChatResponse = {
        answer: clarification.clarificationQuestion!,
        citations: [],
        nextSteps: ['Please provide the requested information for accurate guidance'],
        scripts: [],
        forms: [],
        confidence: 0.9,
        authorities_used: [],
        clarification: {
          question: clarification.clarificationQuestion!,
          intent: 'collect_missing_info',
          options: entities.planType ? undefined : ['HMO', 'PPO', 'EPO', 'HDHP', 'POS']
        }
      };

      // Save clarification message
      await saveMessage(session.chat_id, 'assistant', clarificationResponse.answer, 'clarification', {
        clarification: clarificationResponse.clarification,
        entities
      });

      return NextResponse.json({
        success: true,
        response: clarificationResponse,
        session: {
          chat_id: session.chat_id,
          context: updatedContext
        }
      });
    }

    // Build RAG query
    const ragQuery: RAGQuery = {
      text,
      entities,
      context: updatedContext,
      chat_id: session.chat_id
    };

    // Check cache first
    const cachedResponse = await checkRAGCache(ragQuery);
    if (cachedResponse) {
      console.log('🎯 Using cached RAG response');

      // Save messages
      await saveMessage(session.chat_id, 'user', text, 'text', { entities });
      await saveMessage(session.chat_id, 'assistant', cachedResponse.answer, 'answer', {
        citations: cachedResponse.citations,
        nextSteps: cachedResponse.nextSteps,
        scripts: cachedResponse.scripts,
        forms: cachedResponse.forms,
        calc: cachedResponse.calc
      });

      return NextResponse.json({
        success: true,
        response: cachedResponse,
        session: {
          chat_id: session.chat_id,
          context: updatedContext
        }
      });
    }

    // Perform RAG retrieval
    const retrievalResult = await retriever.retrieve(ragQuery);

    // Compose answer
    const response = await answerComposer.composeAnswer(
      text,
      entities,
      retrievalResult,
      updatedContext
    );

    // Update session context
    updatedContext.lastAnswer = response;
    await updateSessionContext(session.chat_id, updatedContext);

    // Save messages
    await saveMessage(session.chat_id, 'user', text, 'text', {
      entities,
      files: files.length > 0 ? files : undefined
    });

    await saveMessage(session.chat_id, 'assistant', response.answer, 'answer', {
      citations: response.citations,
      nextSteps: response.nextSteps,
      scripts: response.scripts,
      forms: response.forms,
      calc: response.calc,
      confidence: response.confidence,
      authorities_used: response.authorities_used
    });

    // Cache response for future use
    await cacheRAGResponse(ragQuery, response);

    console.log('✅ WyngAI assistant response generated successfully');

    return NextResponse.json({
      success: true,
      response,
      session: {
        chat_id: session.chat_id,
        context: updatedContext
      }
    });

  } catch (error) {
    console.error('Error in WyngAI assistant:', error);
    return NextResponse.json(
      {
        error: 'Failed to process assistant request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Get existing chat session or create new one
 */
async function getOrCreateChatSession(
  chatId?: string,
  caseId?: string,
  userId?: string,
  planInputs?: any
): Promise<ChatSession> {
  if (chatId) {
    // Try to get existing session
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('chat_id', chatId)
      .single();

    if (!error && data) {
      return data;
    }
  }

  // Create new session
  const newSession = {
    case_id: caseId,
    user_id: userId,
    session_type: 'insurance_assistant',
    context_data: {
      planInputs: planInputs || {},
      collectedFacts: {},
      clarificationHistory: []
    } as ChatContext,
    status: 'active'
  };

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert(newSession)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create chat session: ${error.message}`);
  }

  return data;
}

/**
 * Process uploaded files (EOBs, bills, insurance cards, etc.)
 */
async function processFileUploads(files: any[], chatId: string): Promise<any> {
  console.log('📎 Processing file uploads:', files.length);

  // This would integrate with the existing OCR pipeline
  // For now, return placeholder data indicating file processing capability
  return {
    processed_files: files.length,
    extracted_data: {
      plan_info: null,
      claims_info: null,
      financial_info: null
    },
    message: 'File upload processing integration would be implemented here'
  };
}

/**
 * Save chat message to database
 */
async function saveMessage(
  chatId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  messageType: 'text' | 'file_upload' | 'clarification' | 'answer',
  metadata?: any,
  files?: any[]
): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      chat_id: chatId,
      role,
      content,
      message_type: messageType,
      metadata,
      files
    });

  if (error) {
    console.error('Error saving message:', error);
  }
}

/**
 * Update session context
 */
async function updateSessionContext(chatId: string, context: ChatContext): Promise<void> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({
      context_data: context,
      last_activity_at: new Date().toISOString()
    })
    .eq('chat_id', chatId);

  if (error) {
    console.error('Error updating session context:', error);
  }
}

/**
 * Check RAG cache for existing response
 */
async function checkRAGCache(query: RAGQuery): Promise<ChatResponse | null> {
  const queryHash = generateQueryHash(query);

  const { data, error } = await supabase
    .from('rag_cache')
    .select('response_data')
    .eq('query_hash', queryHash)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) {
    return null;
  }

  return data.response_data as ChatResponse;
}

/**
 * Cache RAG response for future use
 */
async function cacheRAGResponse(query: RAGQuery, response: ChatResponse): Promise<void> {
  if (response.confidence < 0.8) {
    return; // Don't cache low-confidence responses
  }

  const queryHash = generateQueryHash(query);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  const { error } = await supabase
    .from('rag_cache')
    .upsert({
      query_hash: queryHash,
      query_text: query.text,
      response_data: response,
      authorities: response.authorities_used,
      expires_at: expiresAt
    }, {
      onConflict: 'query_hash'
    });

  if (error) {
    console.error('Error caching RAG response:', error);
  }
}

/**
 * Generate hash for query caching
 */
function generateQueryHash(query: RAGQuery): string {
  const normalizedQuery = {
    text: query.text.toLowerCase().trim(),
    planType: query.entities.planType,
    state: query.entities.state,
    intent: query.entities.intent
  };

  const { createHash } = require('crypto');
  return createHash('md5')
    .update(JSON.stringify(normalizedQuery))
    .digest('hex');
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json({
    message: 'WyngAI Central Assistant API',
    version: '1.0.0',
    capabilities: [
      'Multi-turn conversations',
      'Authoritative source citations',
      'Plan-specific guidance',
      'File upload processing',
      'Context preservation',
      'Structured responses'
    ]
  });
}