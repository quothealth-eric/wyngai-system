/**
 * Answer Composition System for WyngAI Search Platform
 *
 * This module composes comprehensive answers using RAG search results,
 * with proper citations, next steps, and contextual information.
 */

import OpenAI from 'openai';
import { SearchResult } from './rag/unified';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

export interface Citation {
  title: string;
  authority: string;
  url?: string;
  section?: string;
  relevance_score: number;
}

export interface NextStep {
  action: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  deadline?: string;
}

export interface Script {
  channel: 'payer' | 'provider' | 'hr' | 'government';
  purpose: string;
  body: string;
  estimated_duration: string;
}

export interface ComposedAnswer {
  summary: string;
  answer: string;
  citations: Citation[];
  links: Array<{ label: string; url: string; authority: string }>;
  next_steps: NextStep[];
  scripts?: Script[];
  bill_meta?: {
    bill_id: string;
    number: string;
    title: string;
    introduced_date?: string;
    latest_action?: string;
    url: string;
  };
  confidence: number;
  themes: Array<{ theme: string; score: number }>;
  mode: 'insurance' | 'legislation' | 'mixed';
}

export interface ComposerInput {
  query: string;
  context_frame?: Record<string, any>;
  search_results: SearchResult[];
  mode: 'insurance' | 'legislation' | 'mixed';
  user_state?: string;
  user_coverage?: string;
}

function extractCitations(results: SearchResult[]): Citation[] {
  const citations: Citation[] = [];

  for (const result of results) {
    citations.push({
      title: result.title,
      authority: result.authority,
      url: result.url,
      section: result.section_path?.join(' → '),
      relevance_score: result.similarity
    });
  }

  // Sort by authority rank and relevance
  return citations.sort((a, b) => {
    const authorityRankA = getAuthorityRank(a.authority);
    const authorityRankB = getAuthorityRank(b.authority);

    if (Math.abs(authorityRankA - authorityRankB) > 0.1) {
      return authorityRankB - authorityRankA;
    }

    return b.relevance_score - a.relevance_score;
  });
}

function getAuthorityRank(authority: string): number {
  const ranks: Record<string, number> = {
    'CMS': 1.0,
    'HealthCare.gov': 0.95,
    'Medicare.gov': 0.95,
    'Medicaid.gov': 0.95,
    'Congress.gov': 0.95,
    'California DOI': 0.8,
    'Florida DOI': 0.8,
    'Texas DOI': 0.8,
    'WyngAI Corpus': 0.7
  };

  return ranks[authority] || 0.6;
}

function generateResourceLinks(results: SearchResult[], mode: string): Array<{ label: string; url: string; authority: string }> {
  const links: Array<{ label: string; url: string; authority: string }> = [];

  // Add official marketplace links for insurance queries
  if (mode === 'insurance' || mode === 'mixed') {
    links.push(
      {
        label: 'HealthCare.gov',
        url: 'https://www.healthcare.gov',
        authority: 'CMS'
      },
      {
        label: 'Medicare.gov',
        url: 'https://www.medicare.gov',
        authority: 'CMS'
      },
      {
        label: 'Find Your State Marketplace',
        url: 'https://www.healthcare.gov/marketplace-in-your-state/',
        authority: 'CMS'
      }
    );
  }

  // Add Congress.gov links for legislation queries
  if (mode === 'legislation' || mode === 'mixed') {
    links.push({
      label: 'Congress.gov',
      url: 'https://www.congress.gov',
      authority: 'Library of Congress'
    });
  }

  // Add specific URLs from search results
  for (const result of results.slice(0, 3)) {
    if (result.url && !links.some(link => link.url === result.url)) {
      links.push({
        label: result.title.substring(0, 50) + (result.title.length > 50 ? '...' : ''),
        url: result.url,
        authority: result.authority
      });
    }
  }

  return links;
}

async function generateAnswer(input: ComposerInput): Promise<{ summary: string; answer: string; themes: Array<{ theme: string; score: number }> }> {
  const { query, search_results, mode, context_frame } = input;

  // Prepare context for the LLM
  const context = search_results.map(result => {
    return `[${result.authority}] ${result.title}\n${result.content.substring(0, 800)}`;
  }).join('\n\n---\n\n');

  const systemPrompt = mode === 'legislation'
    ? `You are WyngAI, providing non-partisan analysis of U.S. federal healthcare legislation. Use only the provided bill text and Congress.gov metadata. Be completely neutral and factual. Use "the bill proposes" and "if enacted" phrasing. Explain in lay terms what the bill does, who is affected, and implications. Include specific section citations with URLs when available.`
    : `You are WyngAI, providing accurate guidance about U.S. health insurance. Use the provided authoritative sources to answer completely. Cite Federal/CMS/DOI sources with URLs. If critical details are missing, proceed with assumptions and contingencies rather than asking redundant questions. Include actionable next steps and, when relevant, provide phone scripts for contacting insurance companies or providers.`;

  const userPrompt = mode === 'legislation'
    ? `Analyze this healthcare legislation query and provide a non-partisan summary.

Query: ${query}

Available bill information and text:
${context}

Respond with:
1. One-sentence summary of what the bill does
2. Who would be affected (one sentence)
3. Key implications if enacted (3-4 bullet points)
4. Non-partisan explanation (2-3 paragraphs)

Include specific bill section citations and maintain complete neutrality.`
    : `Answer this health insurance question using the provided authoritative sources.

Query: ${query}
${context_frame ? `\nUser Context: ${JSON.stringify(context_frame)}` : ''}

Available sources:
${context}

Provide:
1. Direct answer to the question
2. Next steps the user should take
3. Relevant phone scripts if applicable
4. Links to official resources

Be specific, actionable, and cite your sources.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 1500
    });

    const fullAnswer = response.choices[0].message.content || '';

    // Extract summary (first paragraph/sentence)
    const summary = fullAnswer.split('\n\n')[0].substring(0, 200);

    // Extract themes from the answer
    const themes = extractThemes(fullAnswer, search_results);

    return {
      summary,
      answer: fullAnswer,
      themes
    };

  } catch (error) {
    console.error('Failed to generate answer:', error);

    // Fallback answer
    const fallbackSummary = mode === 'legislation'
      ? 'Healthcare legislation analysis based on available bill information.'
      : 'Health insurance guidance based on authoritative sources.';

    const fallbackAnswer = mode === 'legislation'
      ? `Based on the available information about this healthcare legislation:\n\n${search_results[0]?.content?.substring(0, 500) || 'Limited information available'}\n\nFor complete bill details, please visit Congress.gov.`
      : `Based on available information from ${search_results.map(r => r.authority).join(', ')}:\n\n${search_results[0]?.content?.substring(0, 500) || 'Please contact your insurance company for specific guidance.'}\n\nAlways verify information with official sources.`;

    return {
      summary: fallbackSummary,
      answer: fallbackAnswer,
      themes: []
    };
  }
}

function extractThemes(answer: string, results: SearchResult[]): Array<{ theme: string; score: number }> {
  const themes: Map<string, number> = new Map();
  const text = answer.toLowerCase();

  const themePatterns = {
    'enrollment': /\b(enrollment|enroll|sign[- ]?up|register)\b/g,
    'eligibility': /\b(eligible|qualify|qualification|requirement)\b/g,
    'coverage': /\b(coverage|covered|benefit|plan)\b/g,
    'costs': /\b(cost|price|premium|deductible|copay|coinsurance|out[- ]?of[- ]?pocket)\b/g,
    'providers': /\b(doctor|provider|network|physician|hospital)\b/g,
    'prescriptions': /\b(prescription|drug|medication|pharmacy|formulary)\b/g,
    'appeals': /\b(appeal|dispute|denial|grievance|review)\b/g,
    'emergency': /\b(emergency|urgent|urgent[- ]?care)\b/g,
    'mental_health': /\b(mental[- ]?health|behavioral[- ]?health|therapy|counseling)\b/g,
    'preventive': /\b(preventive|screening|wellness|checkup|annual)\b/g,
    'marketplace': /\b(marketplace|healthcare\.gov|aca|affordable[- ]?care)\b/g,
    'medicare': /\b(medicare|part[- ]?[abcd]|medigap|supplement)\b/g,
    'medicaid': /\b(medicaid|chip|state[- ]?insurance)\b/g,
    'legislation': /\b(bill|law|congress|senate|house|legislation|policy)\b/g
  };

  for (const [theme, pattern] of Object.entries(themePatterns)) {
    const matches = text.match(pattern);
    if (matches) {
      themes.set(theme, matches.length);
    }
  }

  // Add themes from search results
  for (const result of results) {
    if (result.metadata?.themes) {
      for (const theme of result.metadata.themes) {
        themes.set(theme, (themes.get(theme) || 0) + 1);
      }
    }
  }

  // Convert to array and sort by score
  return Array.from(themes.entries())
    .map(([theme, score]) => ({ theme, score: score / 10 })) // Normalize score
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function generateNextSteps(query: string, mode: string, results: SearchResult[], userState?: string): NextStep[] {
  const steps: NextStep[] = [];

  if (mode === 'insurance' || mode === 'mixed') {
    // Insurance-specific next steps
    if (query.toLowerCase().includes('enroll') || query.toLowerCase().includes('marketplace')) {
      steps.push({
        action: 'Check enrollment deadlines',
        description: 'Verify current open enrollment period for your state marketplace',
        priority: 'high',
        deadline: 'Before enrollment period ends'
      });

      if (userState) {
        steps.push({
          action: `Visit ${userState} marketplace`,
          description: `Go to your state's official marketplace website to compare plans`,
          priority: 'high'
        });
      }
    }

    if (query.toLowerCase().includes('appeal') || query.toLowerCase().includes('denial')) {
      steps.push({
        action: 'File internal appeal',
        description: 'Contact your insurance company to start the internal appeal process',
        priority: 'high',
        deadline: 'Within 60-180 days of denial (check your plan)'
      });

      steps.push({
        action: 'Gather documentation',
        description: 'Collect medical records, prior authorizations, and denial letters',
        priority: 'high'
      });
    }

    if (query.toLowerCase().includes('provider') || query.toLowerCase().includes('network')) {
      steps.push({
        action: 'Verify provider network status',
        description: 'Call your insurance company to confirm provider is in-network',
        priority: 'medium'
      });
    }

    // General insurance steps
    steps.push({
      action: 'Contact your insurance company',
      description: 'Call the number on your insurance card for specific guidance',
      priority: 'medium'
    });
  }

  if (mode === 'legislation') {
    steps.push({
      action: 'Read full bill text',
      description: 'Visit Congress.gov to read the complete legislation',
      priority: 'medium'
    });

    steps.push({
      action: 'Track bill status',
      description: 'Monitor the bill\'s progress through Congress',
      priority: 'low'
    });

    steps.push({
      action: 'Contact representatives',
      description: 'Reach out to your senators and representative if you have concerns',
      priority: 'low'
    });
  }

  return steps.slice(0, 4); // Limit to 4 steps
}

function generateScripts(query: string, results: SearchResult[]): Script[] {
  const scripts: Script[] = [];

  if (query.toLowerCase().includes('appeal') || query.toLowerCase().includes('denial')) {
    scripts.push({
      channel: 'payer',
      purpose: 'File internal appeal for denied claim',
      body: `Hi, I'm calling to file an internal appeal for a denied claim. My member ID is [MEMBER_ID] and the claim number is [CLAIM_NUMBER]. I received a denial letter dated [DATE] and I believe this decision was incorrect because [REASON]. Can you please start the internal appeal process and send me the necessary forms? I'd also like to know the timeline for the appeal decision and if I can submit additional medical documentation to support my case.`,
      estimated_duration: '10-15 minutes'
    });
  }

  if (query.toLowerCase().includes('provider') || query.toLowerCase().includes('network')) {
    scripts.push({
      channel: 'payer',
      purpose: 'Verify provider network status',
      body: `Hello, I need to verify if a healthcare provider is in my network. My member ID is [MEMBER_ID] and I'm looking to see [PROVIDER_NAME] at [PROVIDER_ADDRESS]. Can you confirm if they're in-network for my plan and what my coverage would be for [TYPE_OF_SERVICE]? Also, do I need a referral or prior authorization for this provider?`,
      estimated_duration: '5-10 minutes'
    });
  }

  if (query.toLowerCase().includes('prior authorization') || query.toLowerCase().includes('preauthorization')) {
    scripts.push({
      channel: 'payer',
      purpose: 'Request prior authorization',
      body: `Hi, I need to request prior authorization for a medical service. My member ID is [MEMBER_ID] and my doctor is recommending [PROCEDURE/MEDICATION]. The provider is [PROVIDER_NAME] and they said I need prior auth. Can you tell me what information you need from my doctor and how long the approval process typically takes? I'd also like to know what happens if it's denied.`,
      estimated_duration: '10-15 minutes'
    });
  }

  return scripts;
}

export async function composeAnswer(input: ComposerInput): Promise<ComposedAnswer> {
  try {
    const { query, search_results, mode, context_frame } = input;

    // Generate the main answer
    const { summary, answer, themes } = await generateAnswer(input);

    // Extract citations
    const citations = extractCitations(search_results);

    // Generate resource links
    const links = generateResourceLinks(search_results, mode);

    // Generate next steps
    const next_steps = generateNextSteps(query, mode, search_results, input.user_state);

    // Generate scripts for insurance queries
    const scripts = mode === 'insurance' || mode === 'mixed'
      ? generateScripts(query, search_results)
      : undefined;

    // Extract bill metadata if legislation mode
    let bill_meta;
    if (mode === 'legislation' && search_results.length > 0 && search_results[0].bill_id) {
      const billResult = search_results[0];
      bill_meta = {
        bill_id: billResult.bill_id!,
        number: billResult.metadata?.number || billResult.bill_id!,
        title: billResult.title,
        introduced_date: billResult.metadata?.introduced_date,
        latest_action: billResult.metadata?.latest_action,
        url: billResult.url!
      };
    }

    // Calculate confidence score
    const confidence = search_results.length > 0
      ? Math.min(0.95, search_results.reduce((sum, r) => sum + r.similarity, 0) / search_results.length)
      : 0.3;

    return {
      summary,
      answer,
      citations,
      links,
      next_steps,
      scripts,
      bill_meta,
      confidence,
      themes,
      mode
    };

  } catch (error) {
    console.error('Failed to compose answer:', error);
    throw error;
  }
}