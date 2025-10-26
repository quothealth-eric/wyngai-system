import { createHash, randomUUID } from 'crypto';
import { DataSourceConnector, DiscoveredDocument, DocumentSection, ProcessedDocument } from '@/lib/types/rag';

/**
 * Florida Department of Financial Services (Office of Insurance Regulation) connector scaffold.
 * The canonical rules live across multiple HTML pages. We ingest a curated rules digest maintained in docs/governance.
 */
export class FloridaDOIConnector implements DataSourceConnector {
  source_id = 'state:FL';
  authority = 'state_doi';
  jurisdiction = 'FL';
  private readonly pages = [
    {
      url: 'https://www.floir.com/siteDocuments/OIR_Appeals_External_Review.html',
      title: 'Florida External Review Rights',
      doc_type: 'faq'
    },
    {
      url: 'https://www.myfloridacfo.com/Division/Consumers/UnderstandingCoverage/health/',
      title: 'Florida Health Insurance Consumer Guide',
      doc_type: 'policy'
    }
  ];

  async fetch_index(): Promise<DiscoveredDocument[]> {
    return this.pages.map((page) => ({
      ...page,
      version: new Date().toISOString().slice(0, 10)
    }));
  }

  async fetch_doc(url: string): Promise<ProcessedDocument> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WyngAI/1.0 (+https://www.getwyng.com)',
        Accept: 'text/html'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch FL DOI resource: ${url}`);
    }

    const html = await response.text();
    const text = this.extractReadableText(html);
    const sha256 = createHash('sha256').update(text).digest('hex');

    const page = this.pages.find((p) => p.url === url);

    return {
      url,
      title: page?.title || 'Florida DOI Resource',
      content: text,
      metadata: { html_length: html.length },
      doc_type: page?.doc_type || 'policy',
      version: new Date().toISOString().slice(0, 10),
      sha256
    };
  }

  async split_to_sections(doc: ProcessedDocument): Promise<DocumentSection[]> {
    const paragraphs = doc.content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

    return paragraphs.map((paragraph, index) => ({
      section_id: randomUUID(),
      doc_id: '',
      section_path: `paragraph-${index + 1}`,
      title: doc.title,
      text: paragraph,
      tokens: Math.round(paragraph.length / 4),
      eff_date: doc.eff_date,
      version: doc.version,
      created_at: new Date().toISOString()
    }));
  }

  private extractReadableText(html: string): string {
    const stripped = html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    return stripped.trim();
  }
}
