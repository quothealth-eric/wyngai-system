import { composeSearchResponse } from '../../src/lib/search/compose';

describe('Search composer', () => {
  it('creates a structured answer with citations', async () => {
    const response = await composeSearchResponse({
      query: 'How do I file an external review in CA?',
      ragResults: {
        sections: [
          {
            section_id: '1',
            text: 'California requires plans to offer an external review with a 4 month filing deadline.',
            doc: {
              doc_id: 'doc1',
              authority: 'state_doi',
              title: 'California DOI External Review',
              eff_date: '2024-01-01',
              url: 'https://example.com',
              jurisdiction: 'CA',
              payer: null
            },
            score: 0.9
          }
        ],
        authorityMix: { state_doi: 1 }
      }
    });

    expect(response.summary).toContain('California DOI');
    expect(response.citations.length).toBeGreaterThan(0);
    expect(response.confidence).toBeGreaterThan(0);
  });
});
