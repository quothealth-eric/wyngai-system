/**
 * WyngAI Central Assistant - Enhanced Chat API
 * Multi-turn conversation with minimal clarifier policy and structured responses
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EnhancedIntentRouter } from '@/lib/intent/enhanced-router';
import { ContextFrame, SlotManager } from '@/lib/context/slots';
import { EntityExtractor } from '@/lib/context/extract';
import { ClarifierPolicy } from '@/lib/policies/minimal_clarifier';
import { AnswerComposer, StructuredResponse } from '@/lib/chat/compose_answer';

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
      conversationHistory = [],
      isFollowUp = false
    } = body;

    console.log('🧠 Processing WyngAI assistant request with minimal clarifier:', {
      hasText: !!text,
      filesCount: files.length,
      chatId,
      isFollowUp,
      historyLength: conversationHistory.length
    });

    // Validate required fields
    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Question text is required' },
        { status: 400 }
      );
    }

    // Step 1: Load or create context frame
    let contextFrame = await loadContextFrame(chatId);
    if (!contextFrame) {
      contextFrame = SlotManager.createFrame(chatId || 'temp-session');
    }

    // Step 2: Extract entities and update context frame
    const extractionInput = {
      text,
      files: files.map((f: any) => ({ name: f.name, type: f.type, content: f.content }))
    };

    contextFrame = EntityExtractor.updateContextFrame(contextFrame, extractionInput);

    console.log('🔍 Updated context frame:', {
      threadId: contextFrame.threadId,
      slotCount: Object.keys(contextFrame.slots).length,
      highConfidenceSlots: Object.entries(contextFrame.slots)
        .filter(([_, slot]) => slot && slot.confidence >= 0.7)
        .map(([key, _]) => key)
    });

    // Step 3: Intent Classification
    const intentRouter = new EnhancedIntentRouter();
    const intentResult = await intentRouter.routeIntent({
      text,
      files: files.map((f: any) => ({ name: f.name, size: f.size, type: f.type })),
      context: {
        previousIntent: conversationHistory.length > 0 ? 'CHAT' : undefined,
        conversationHistory: conversationHistory.map((msg: any) => msg.content)
      }
    });

    console.log('🎯 Intent classification:', {
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      themes: intentResult.themes?.slice(0, 3)
    });

    // Step 4: Check if clarification is needed using minimal clarifier policy
    const clarificationCheck = ClarifierPolicy.needsClarification(
      contextFrame,
      intentResult.intent,
      intentResult.themes?.map(t => t.theme) || []
    );

    // Step 5: If clarification needed and not redundant, ask clarifying question
    if (clarificationCheck.needed && clarificationCheck.message) {
      const shouldSuppress = ClarifierPolicy.shouldSuppressClarification(
        contextFrame,
        clarificationCheck.message
      );

      if (!shouldSuppress) {
        console.log('❓ Asking clarification:', clarificationCheck.message);

        // Save context frame before asking clarification
        await saveContextFrame(contextFrame);

        return NextResponse.json({
          success: true,
          response: {
            answer: clarificationCheck.message,
            citations: [],
            nextSteps: [],
            scripts: [],
            forms: [],
            confidence: 0.9,
            authorities_used: [],
            clarification: {
              question: clarificationCheck.message,
              intent: 'collect_missing_info',
              options: undefined
            }
          },
          session: {
            chat_id: chatId || 'temp-session',
            context: contextFrame
          },
          metadata: {
            clarifierSuppressed: false,
            slotsFilled: Object.keys(contextFrame.slots).length,
            intent: intentResult.intent,
            confidence: intentResult.confidence
          }
        });
      } else {
        console.log('🚫 Suppressing redundant clarification');
      }
    }

    // Step 6: Generate complete structured answer
    console.log('✅ Generating complete answer - no clarification needed');

    const composerInput = {
      frame: contextFrame,
      intent: intentResult.intent,
      themes: intentResult.themes?.map(t => t.theme) || [],
      retrievedChunks: [], // Could integrate with RAG here
      userQuery: text
    };

    const structuredResponse = await AnswerComposer.composeAnswer(composerInput);
    const formattedAnswer = AnswerComposer.formatResponse(structuredResponse);

    // Step 7: Save updated context frame
    await saveContextFrame(contextFrame);

    // Step 8: Store analytics
    await storeInteractionAnalytics({
      chatId: chatId || 'temp-session',
      intentResult,
      contextFrame,
      clarifierSuppressed: clarificationCheck.needed && ClarifierPolicy.shouldSuppressClarification(contextFrame, clarificationCheck.message || ''),
      structuredResponse
    });

    console.log('✅ WyngAI assistant response completed with minimal clarifier');

    return NextResponse.json({
      success: true,
      response: {
        answer: formattedAnswer,
        citations: structuredResponse.citations.map(c => ({
          authority: c.authority,
          title: c.title,
          url: c.url
        })),
        nextSteps: structuredResponse.nextSteps,
        scripts: structuredResponse.scripts.map(s => ({
          channel: s.channel,
          purpose: s.purpose,
          body: s.body,
          estimated_duration: s.estimatedDuration
        })),
        forms: [], // Could add forms if needed
        confidence: 0.9,
        authorities_used: structuredResponse.citations.map(c => c.authority),
        structuredResponse: structuredResponse
      },
      session: {
        chat_id: chatId || 'temp-session',
        context: contextFrame
      },
      metadata: {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        themes: intentResult.themes,
        clarifierSuppressed: clarificationCheck.needed && ClarifierPolicy.shouldSuppressClarification(contextFrame, clarificationCheck.message || ''),
        slotsFilled: Object.keys(contextFrame.slots).length,
        confidencePill: structuredResponse.confidencePill
      }
    });

  } catch (error) {
    console.error('❌ WyngAI assistant error:', error);
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
 * Load context frame from storage
 */
async function loadContextFrame(chatId?: string): Promise<ContextFrame | null> {
  if (!chatId) return null;

  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('context_frame')
      .eq('chat_id', chatId)
      .single();

    if (error || !data?.context_frame) return null;

    return SlotManager.deserialize(data.context_frame);
  } catch (error) {
    console.error('Failed to load context frame:', error);
    return null;
  }
}

/**
 * Save context frame to storage
 */
async function saveContextFrame(frame: ContextFrame): Promise<void> {
  try {
    const serialized = SlotManager.serialize(frame);

    const { error } = await supabase
      .from('chat_sessions')
      .upsert({
        chat_id: frame.threadId,
        context_frame: serialized,
        updated_at: new Date()
      });

    if (error) {
      console.error('Failed to save context frame:', error);
    }
  } catch (error) {
    console.error('Failed to save context frame:', error);
  }
}

/**
 * Store interaction analytics
 */
async function storeInteractionAnalytics(data: {
  chatId: string;
  intentResult: any;
  contextFrame: ContextFrame;
  clarifierSuppressed: boolean;
  structuredResponse: StructuredResponse;
}) {
  try {
    await supabase.from('analytics_events').insert({
      chat_id: data.chatId,
      event_name: 'minimal_clarifier_query',
      event_params: {
        intent: data.intentResult.intent,
        confidence: data.intentResult.confidence,
        themes: data.intentResult.themes,
        clarifier_suppressed: data.clarifierSuppressed,
        slots_filled_count: Object.keys(data.contextFrame.slots).length,
        high_confidence_slots: Object.entries(data.contextFrame.slots)
          .filter(([_, slot]) => slot && slot.confidence >= 0.7)
          .map(([key, _]) => key),
        response_type: 'structured',
        citations_count: data.structuredResponse.citations.length,
        scripts_count: data.structuredResponse.scripts.length,
        links_count: data.structuredResponse.whereToGo.length
      }
    });
  } catch (error) {
    console.error('Failed to store analytics:', error);
    // Don't throw - analytics failure shouldn't break the request
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json({
    message: 'WyngAI Central Assistant API with Minimal Clarifier',
    version: '3.0.0',
    capabilities: [
      'Context frame and slot management',
      'Minimal clarifier policy with redundancy prevention',
      'Structured responses with links, scripts, and citations',
      'Entity extraction from text and files',
      'Assumption-aware answers with contingencies',
      'State-specific marketplace and DOI links',
      'Complete coverage change guidance (gold standard)',
      'Bill analysis with 18-rule detection',
      'Appeal assistance with deadlines and scripts'
    ]
  });
}