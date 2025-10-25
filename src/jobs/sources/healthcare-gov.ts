import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { DataSourceConnector, DiscoveredDocument, DocumentSection, ProcessedDocument } from '@/lib/types/rag';

/**
 * Healthcare.gov + State Marketplace FAQs connector
 * Minimal scaffold that fetches the consolidated FAQ JSON feed published by healthcare.gov.
 * The real implementation will expand coverage with pagination + state marketplace discovery.
 */
export class HealthcareGovConnector implements DataSourceConnector {
  source_id = 'healthcare_gov';
  authority: string = 'marketplace';
  private readonly baseUrl = 'https://www.healthcare.gov/api/v1/faqs.json';

  async fetch_index(): Promise<DiscoveredDocument[]> {
    // Healthcare.gov exposes a JSON list of FAQs in a single payload.
    // We treat the manifest as a single discovered document so the scheduler can diff hash values.
    return [
      {
        url: this.baseUrl,
        title: 'Healthcare.gov Marketplace FAQs',
        doc_type: 'faq',
        version: new Date().toISOString().slice(0, 10)
      }
    ];
  }

  async fetch_doc(url: string): Promise<ProcessedDocument> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WyngAI/1.0 (+https://www.getwyng.com)',
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch healthcare.gov FAQs: ${response.status}`);
    }

    const data = await response.json();
    const serialized = JSON.stringify(data);
    const sha256 = createHash('sha256').update(serialized).digest('hex');

    return {
      url,
      title: 'Healthcare.gov Marketplace FAQs',
      content: serialized,
      metadata: { count: Array.isArray(data?.faqs) ? data.faqs.length : 0 },
      doc_type: 'faq',
      version: new Date().toISOString().slice(0, 10),
      sha256
    };
  }

  async split_to_sections(doc: ProcessedDocument): Promise<DocumentSection[]> {
    const parsed = JSON.parse(doc.content);
    const faqs = Array.isArray(parsed?.faqs) ? parsed.faqs : [];

    return faqs.map((faq: any, index: number) => {
      const text = `${faq.question}\n\n${faq.answer}`.trim();
      return {
        section_id: randomUUID(),
        doc_id: '',
        section_path: faq.slug || `faq-${index + 1}`,
        title: faq.question,
        text,
        tokens: Math.round(text.length / 4),
        eff_date: doc.eff_date,
        version: doc.version,
        created_at: new Date().toISOString()
      };
    });
  }
}
