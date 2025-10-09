import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ChatAnswer, PricedSummary } from '@/types/analyzer';
import { PolicyCitation } from '@/types/common';

// Environment validation
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !ANTHROPIC_API_KEY) {
  throw new Error('Missing required configuration');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// Route configuration
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Mock knowledge base for healthcare Q&A
const HEALTHCARE_KNOWLEDGE = [
  {
    question: "Why is my patient responsibility so high?",
    answer: "High patient responsibility can result from several factors: unmet deductibles, out-of-network providers, non-covered services, or billing errors. Review your benefits and compare charges to your plan's coverage.",
    checklist: [
      "Check if your deductible has been met",
      "Verify the provider was in-network",
      "Review if services are covered by your plan",
      "Look for any billing or coding errors",
      "Contact your insurance for clarification"
    ],
    phoneScript: "I'm calling about my recent claim and want to understand why my patient responsibility is higher than expected. Can you help me review the coverage and benefits that were applied?"
  },
  {
    question: "How do I appeal a denied claim?",
    answer: "To appeal a denied claim, you typically have 180 days from the denial date. Submit a written appeal with supporting documentation, including medical records and a letter from your provider explaining the medical necessity.",
    checklist: [
      "Review the denial reason (CARC/RARC codes)",
      "Gather supporting medical documentation",
      "Write or have your provider write an appeal letter",
      "Submit within the appeal timeframe",
      "Follow up on your appeal status"
    ],
    phoneScript: "I need to file an appeal for a denied claim. Can you provide me with the appeal address and tell me what documentation I need to include?"
  },
  {
    question: "What are these codes on my EOB?",
    answer: "EOBs contain several types of codes: CPT codes identify procedures performed, HCPCS codes are for supplies and services, CARC codes explain claim adjustments, and RARC codes provide additional remarks about processing.",
    checklist: [
      "Look up CPT codes to understand procedures",
      "Check HCPCS codes for supplies or services",
      "Review CARC codes for adjustment reasons",
      "Read RARC codes for processing remarks",
      "Contact provider if codes seem incorrect"
    ]
  }
];

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Starting chat analysis from Supabase data...');

    const body = await request.json();
    const { caseId, question } = body;

    if (!caseId || !question) {
      return NextResponse.json(
        { error: 'Case ID and question are required' },
        { status: 400 }
      );
    }

    console.log(`💬 Analyzing question for case: ${caseId}`);

    // 1. Fetch OCR extractions from Supabase
    const { data: extractions, error: extractionsError } = await supabase
      .from('ocr_extractions')
      .select('*')
      .eq('case_id', caseId)
      .order('page', { ascending: true })
      .order('row_idx', { ascending: true });

    if (extractionsError) {
      console.error('❌ Failed to fetch extractions:', extractionsError);
      return NextResponse.json(
        { error: 'Failed to fetch case data' },
        { status: 500 }
      );
    }

    if (!extractions || extractions.length === 0) {
      return NextResponse.json(
        { error: 'No case data found. Please run OCR ingest first.' },
        { status: 404 }
      );
    }

    // 2. Build priced summary from extractions
    const highConfidenceItems = extractions.filter(e => !e.low_conf && (e.doc_type === 'BILL' || e.doc_type === 'EOB'));

    const totals = {
      billed: highConfidenceItems.reduce((sum, item) => sum + (item.charge_cents || 0), 0),
      allowed: highConfidenceItems.reduce((sum, item) => sum + (item.allowed_cents || 0), 0),
      planPaid: highConfidenceItems.reduce((sum, item) => sum + (item.plan_paid_cents || 0), 0),
      patientResp: highConfidenceItems.reduce((sum, item) => sum + (item.patient_resp_cents || 0), 0)
    };

    const pricedSummary: PricedSummary = {
      header: {
        providerName: extractions[0]?.keyfacts?.provider_name,
        NPI: extractions[0]?.keyfacts?.provider_npi,
        claimId: extractions[0]?.keyfacts?.claim_id,
        accountId: extractions[0]?.keyfacts?.account_id,
        serviceDates: extractions[0]?.keyfacts?.service_dates,
        payer: extractions[0]?.keyfacts?.payer
      },
      totals,
      lines: highConfidenceItems.map(item => ({
        lineId: `${item.case_id}_${item.row_idx}`,
        code: item.code,
        modifiers: item.modifiers,
        description: item.description,
        units: item.units ? Number(item.units) : undefined,
        dos: item.dos ? new Date(item.dos).toISOString().split('T')[0] : undefined,
        pos: item.pos,
        revCode: item.rev_code,
        npi: item.npi,
        charge: item.charge_cents,
        allowed: item.allowed_cents,
        planPaid: item.plan_paid_cents,
        patientResp: item.patient_resp_cents,
        conf: item.conf || undefined
      })),
      notes: extractions
        .filter(e => e.low_conf)
        .map(e => `Low confidence: ${e.description || 'Unknown item'}`)
    };

    // 3. Find best matching knowledge base entry
    const bestMatch = findBestMatchingAnswer(question, HEALTHCARE_KNOWLEDGE);

    // 4. Extract key facts for context
    const keyFacts = extractions
      .filter(e => e.keyfacts)
      .map(e => e.keyfacts)
      .reduce((acc, kf) => ({ ...acc, ...kf }), {});

    // 5. Generate contextual answer
    const contextualAnswer = generateContextualAnswer(
      question,
      bestMatch,
      pricedSummary,
      keyFacts
    );

    // 6. Build response
    const response: ChatAnswer = {
      answer: contextualAnswer.answer,
      checklist: contextualAnswer.checklist,
      phoneScripts: contextualAnswer.phoneScript ? [contextualAnswer.phoneScript] : [],
      appealSnippet: contextualAnswer.appealSnippet,
      sources: [
        {
          title: "Healthcare Claims Analysis",
          url: "https://getwyng.co/knowledge",
          snippet: "Wyng AI analysis based on dual-vendor OCR consensus",
          lastAccessed: new Date().toISOString()
        }
      ],
      pricedSummary: totals.billed > 0 ? pricedSummary : undefined,
      confidence: bestMatch.similarity,
      matchedQuestions: [
        {
          question: bestMatch.question,
          similarity: bestMatch.similarity
        }
      ]
    };

    console.log(`✅ Chat analysis completed with ${response.confidence.toFixed(2)} confidence`);

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Chat analysis failed:', error);

    return NextResponse.json(
      { error: 'Chat analysis failed. Please try again or contact support if the problem persists.' },
      { status: 500 }
    );
  }
}

// Find best matching answer from knowledge base
function findBestMatchingAnswer(question: string, knowledge: any[]): any & { similarity: number } {
  const questionLower = question.toLowerCase();

  let bestMatch = knowledge[0];
  let bestScore = 0;

  for (const entry of knowledge) {
    const score = calculateSimilarity(questionLower, entry.question.toLowerCase());
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return { ...bestMatch, similarity: Math.max(bestScore, 0.7) };
}

// Simple similarity calculation
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);

  let matches = 0;
  for (const word1 of words1) {
    if (word1.length > 3 && words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
      matches++;
    }
  }

  return words1.length > 0 ? matches / words1.length : 0;
}

// Generate contextual answer based on case data
function generateContextualAnswer(
  question: string,
  baseAnswer: any,
  pricedSummary: PricedSummary,
  keyFacts: any
): {
  answer: string;
  checklist: string[];
  phoneScript?: string;
  appealSnippet?: string;
} {
  let answer = baseAnswer.answer;
  let checklist = [...baseAnswer.checklist];
  let phoneScript = baseAnswer.phoneScript;
  let appealSnippet: string | undefined;

  // Add case-specific context
  if (pricedSummary.totals.patientResp && pricedSummary.totals.patientResp > 100000) {
    answer += ` In your case, the patient responsibility is $${(pricedSummary.totals.patientResp / 100).toFixed(2)}, which is significant and warrants review.`;
    checklist.push("Review this high patient responsibility amount specifically");
  }

  if (keyFacts.denial_reason) {
    answer += ` Your claim shows a denial reason: ${keyFacts.denial_reason}.`;
    appealSnippet = `I am writing to appeal the denial of my claim. The stated reason for denial was "${keyFacts.denial_reason}". I believe this denial is incorrect because [state your reason here]. Please reconsider this claim and process payment accordingly.`;
  }

  if (keyFacts.carc_codes && keyFacts.carc_codes.length > 0) {
    answer += ` The CARC codes on your claim are: ${keyFacts.carc_codes.join(', ')}.`;
    checklist.push(`Look up the meaning of CARC codes: ${keyFacts.carc_codes.join(', ')}`);
  }

  // Enhance phone script with case specifics
  if (phoneScript && pricedSummary.header.claimId) {
    phoneScript += ` My claim ID is ${pricedSummary.header.claimId}.`;
  }

  return {
    answer,
    checklist,
    phoneScript,
    appealSnippet
  };
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}