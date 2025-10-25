import { createClient } from '@supabase/supabase-js';
import { SearchResponse, SearchResultSection } from '@/lib/rag/index';

export interface QaMatch {
  qa_id: string;
  theme: string | null;
  question: string;
  answer: string | null;
  source: string | null;
  url: string | null;
  confidence: number;
}

export interface ComposeInput {
  query: string;
  ragResults: SearchResponse;
  qaMatches?: QaMatch[];
}

export interface ComposedAnswer {
  summary: string;
  answer: string;
  links: { label: string; url: string }[];
  citations: {
    authority: string;
    title: string;
    section_or_policy?: string;
    eff_date?: string | null;
    url?: string | null;
  }[];
  nextSteps: string[];
  scripts: { channel: 'payer' | 'provider' | 'HR'; body: string }[];
  confidence: number;
  themes: { theme: string; score: number }[];
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceRole
  ? createClient(supabaseUrl, supabaseServiceRole)
  : null;

export async function findQaMatches(query: string, limit = 3): Promise<QaMatch[]> {
  if (!supabase || typeof (supabase as any).from !== 'function') return [];

  try {
    const pattern = `%${query.split(/\s+/).join('%')}%`;
    const { data, error } = await supabase
      .from('qa_bank')
      .select('qa_id, theme, question, answer, source, url')
      .ilike('question', pattern)
      .limit(limit);

    if (error) {
      console.warn('QA match lookup failed', error);
      return [];
    }

    return (data || []).map((row) => ({
      qa_id: row.qa_id,
      theme: row.theme,
      question: row.question,
      answer: row.answer,
      source: row.source,
      url: row.url,
      confidence: row.answer ? 0.8 : 0.4
    }));
  } catch (error) {
    console.warn('QA match lookup skipped (client offline)', error);
    return [];
  }
}

export async function composeSearchResponse(input: ComposeInput): Promise<ComposedAnswer> {
  const qaMatches = input.qaMatches ?? (await findQaMatches(input.query));
  const primarySection = pickPrimarySection(input.ragResults.sections);

  const summary = primarySection
    ? summarizeSection(primarySection)
    : 'We found guidance from our compliance library.';

  const answerParagraphs = buildAnswerParagraphs(primarySection, qaMatches, input.ragResults.sections);

  const citations = input.ragResults.sections.slice(0, 4).map((section) => ({
    authority: section.doc.authority,
    title: section.doc.title,
    section_or_policy: section.doc.doc_id,
    eff_date: section.doc.eff_date,
    url: section.doc.url
  }));

  const links = buildLinks(primarySection, qaMatches);
  const nextSteps = buildNextSteps(primarySection, qaMatches);
  const scripts = buildScripts(primarySection);
  const confidence = calculateConfidence(primarySection, qaMatches, input.ragResults);
  const themes = buildThemes(primarySection, qaMatches);

  return {
    summary,
    answer: answerParagraphs.join('\n\n'),
    links,
    citations,
    nextSteps,
    scripts,
    confidence,
    themes
  };
}

function pickPrimarySection(sections: SearchResultSection[]): SearchResultSection | undefined {
  return sections.length > 0 ? sections[0] : undefined;
}

function summarizeSection(section?: SearchResultSection): string {
  if (!section) return '';
  const prefix = `${section.doc.title}`;
  return `${prefix} — key points highlighted below.`;
}

function buildAnswerParagraphs(
  primarySection: SearchResultSection | undefined,
  qaMatches: QaMatch[],
  sections: SearchResultSection[]
): string[] {
  const paragraphs: string[] = [];

  if (primarySection) {
    paragraphs.push(primarySection.text.slice(0, 700));
  }

  if (qaMatches.length > 0) {
    const qaSummary = qaMatches
      .map((match) => `• ${match.question}${match.answer ? ` — ${match.answer}` : ''}`)
      .join('\n');
    paragraphs.push('Related questions:\n' + qaSummary);
  }

  const supporting = sections.slice(1, 3).map((section) => section.text.slice(0, 500));
  paragraphs.push(...supporting);

  return paragraphs.filter(Boolean);
}

function buildLinks(
  primarySection: SearchResultSection | undefined,
  qaMatches: QaMatch[]
): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];

  if (primarySection?.doc.url) {
    links.push({ label: primarySection.doc.title, url: primarySection.doc.url });
  }

  qaMatches.forEach((match) => {
    if (match.url) {
      links.push({ label: match.source ? `${match.source} FAQ` : 'Related FAQ', url: match.url });
    }
  });

  return links;
}

function buildNextSteps(
  primarySection: SearchResultSection | undefined,
  qaMatches: QaMatch[]
): string[] {
  const steps: string[] = [];

  if (primarySection?.doc.authority === 'state_doi') {
    steps.push('Submit required forms to your state Department of Insurance within the stated deadlines.');
  }

  if (primarySection?.doc.authority === 'payer') {
    steps.push('Review payer prior authorization portal requirements and capture reference numbers.');
  }

  if (qaMatches.some((match) => (match.theme || '').toLowerCase().includes('appeal'))) {
    steps.push('Gather denial letters and plan your appeal letter using WyngAI Appeal Studio.');
  }

  if (steps.length === 0) {
    steps.push('Review the linked citations for detailed requirements.');
  }

  return steps;
}

function buildScripts(primarySection: SearchResultSection | undefined): { channel: 'payer' | 'provider' | 'HR'; body: string }[] {
  if (!primarySection) return [];

  if (primarySection.doc.authority === 'payer') {
    return [
      {
        channel: 'payer',
        body: 'Call the payer member services line and cite the policy linked above. Ask for a reference number.'
      }
    ];
  }

  if (primarySection.doc.authority === 'state_doi') {
    return [
      {
        channel: 'HR',
        body: 'Notify your HR benefits team that you are invoking state appeal protections and request plan documents.'
      }
    ];
  }

  return [];
}

function calculateConfidence(
  primarySection: SearchResultSection | undefined,
  qaMatches: QaMatch[],
  ragResults: SearchResponse
): number {
  let score = 0.5;
  if (primarySection) {
    score += 0.2;
    if (['federal', 'cms'].includes(primarySection.doc.authority)) {
      score += 0.1;
    }
  }

  if (qaMatches.length > 0) {
    score += 0.1;
  }

  if (ragResults.sections.length >= 3) {
    score += 0.05;
  }

  return Math.min(0.95, score);
}

function buildThemes(primarySection: SearchResultSection | undefined, qaMatches: QaMatch[]): { theme: string; score: number }[] {
  const themes = new Map<string, number>();

  if (primarySection?.doc.authority === 'payer') {
    themes.set('Prior Authorization', 0.8);
  }

  qaMatches.forEach((match) => {
    if (match.theme) {
      themes.set(match.theme, Math.max(match.confidence, themes.get(match.theme) || 0.6));
    }
  });

  if (themes.size === 0) {
    themes.set('Other', 0.5);
  }

  return Array.from(themes.entries()).map(([theme, score]) => ({ theme, score }));
}
