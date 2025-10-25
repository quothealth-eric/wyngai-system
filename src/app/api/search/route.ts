import { NextResponse } from 'next/server';
import { search } from '@/lib/rag/index';
import { composeSearchResponse, findQaMatches } from '@/lib/search/compose';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query = String(body.query || '').trim();

    if (!query) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    const filters = body.filters ?? {};
    const ragResults = await search({ query, filters, k: body.k });
    const qaMatches = await findQaMatches(query);
    const composed = await composeSearchResponse({ query, ragResults, qaMatches });

    return NextResponse.json({
      query,
      filters,
      answer: composed,
      rag: ragResults,
      qaMatches
    });
  } catch (error) {
    console.error('Search route error', error);
    return NextResponse.json({ error: 'Failed to compose search answer' }, { status: 500 });
  }
}
