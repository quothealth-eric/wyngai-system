import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { DocumentSection } from '@/lib/types/rag';

export interface SearchFilters {
  authority?: string;
  state?: string;
  payer?: string;
}

export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  k?: number;
}

export interface SearchResultSection {
  section_id: string;
  text: string;
  doc: {
    doc_id: string;
    authority: string;
    title: string;
    eff_date: string | null;
    url: string | null;
    jurisdiction: string | null;
    payer: string | null;
  };
  score: number;
}

export interface SearchResponse {
  sections: SearchResultSection[];
  authorityMix: Record<string, number>;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceRole
  ? createClient(supabaseUrl, supabaseServiceRole)
  : null;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function embedSections(sections: DocumentSection[]): Promise<void> {
  if (!supabase) {
    console.warn('Supabase not configured. Skipping embedding upsert.');
    return;
  }

  if (!openai) {
    console.warn('OpenAI API key missing. Unable to generate embeddings.');
    return;
  }

  if (!sections.length) {
    return;
  }

  const batchSize = 16;
  for (let i = 0; i < sections.length; i += batchSize) {
    const batch = sections.slice(i, i + batchSize);
    const input = batch.map((section) => section.text.slice(0, 6000));
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input,
      dimensions: 1536
    });

    const rows = batch.map((section, index) => ({
      section_id: section.section_id,
      embedding: response.data[index].embedding
    }));

    const { error } = await supabase.from('embeddings').upsert(rows);
    if (error) {
      console.error('Failed to upsert embeddings', error);
    }
  }
}

export async function search(request: SearchRequest): Promise<SearchResponse> {
  if (!supabase || typeof (supabase as any).from !== 'function') {
    console.warn('Supabase not configured; returning empty search result.');
    return { sections: [], authorityMix: {} };
  }

  const k = request.k ?? 8;
  const filters = request.filters ?? {};

  // Basic lexical search fallback using Postgres full text search.
  let queryBuilder = supabase
    .from('sections')
    .select(
      `section_id, text, doc_id, documents:documents(doc_id, authority, title, eff_date, url, jurisdiction, payer)`,
      { count: 'exact' }
    )
    .limit(k)
    .order('created_at', { ascending: false });

  if (request.query) {
    const pattern = `%${request.query.split(/\s+/).join('%')}%`;
    queryBuilder = queryBuilder.ilike('text', pattern);
  }

  if (filters.authority) {
    queryBuilder = queryBuilder.eq('documents.authority', filters.authority);
  }

  if (filters.state) {
    queryBuilder = queryBuilder.eq('documents.jurisdiction', filters.state);
  }

  if (filters.payer) {
    queryBuilder = queryBuilder.eq('documents.payer', filters.payer);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    console.error('Search query failed', error);
    throw error;
  }

  const sections = (data || []).map((row: any, index: number) => ({
    section_id: row.section_id,
    text: row.text,
    doc: {
      doc_id: row.documents?.doc_id ?? row.doc_id,
      authority: row.documents?.authority ?? 'unknown',
      title: row.documents?.title ?? 'Untitled',
      eff_date: row.documents?.eff_date ?? null,
      url: row.documents?.url ?? null,
      jurisdiction: row.documents?.jurisdiction ?? null,
      payer: row.documents?.payer ?? null
    },
    score: 1 - index * 0.05
  }));

  // Ensure at least one federal/CMS section by falling back to latest entries when needed.
  if (!sections.some((section) => ['federal', 'cms'].includes(section.doc.authority)) && request.query) {
    const fallback = await supabase
      .from('sections')
      .select(
        `section_id, text, doc_id, documents:documents(doc_id, authority, title, eff_date, url, jurisdiction, payer)`
      )
      .eq('documents.authority', 'federal')
      .limit(1)
      .order('created_at', { ascending: false });

    if (fallback.data && fallback.data.length > 0) {
      const row = fallback.data[0] as any;
      sections.push({
        section_id: row.section_id,
        text: row.text,
        doc: {
          doc_id: row.documents?.doc_id ?? row.doc_id,
          authority: row.documents?.authority ?? 'unknown',
          title: row.documents?.title ?? 'Untitled',
          eff_date: row.documents?.eff_date ?? null,
          url: row.documents?.url ?? null,
          jurisdiction: row.documents?.jurisdiction ?? null,
          payer: row.documents?.payer ?? null
        },
        score: 0.25
      });
    }
  }

  const authorityMix = sections.reduce<Record<string, number>>((acc, section) => {
    acc[section.doc.authority] = (acc[section.doc.authority] || 0) + 1;
    return acc;
  }, {});

  return {
    sections,
    authorityMix
  };
}
