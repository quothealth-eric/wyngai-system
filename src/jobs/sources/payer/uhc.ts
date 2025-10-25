import { createHash, randomUUID } from 'crypto';
import { DataSourceConnector, DiscoveredDocument, DocumentSection, ProcessedDocument } from '@/lib/types/rag';

/**
 * UnitedHealthcare policy library connector scaffold.
 * For the MVP we rely on a curated JSON manifest stored in docs/governance until the authenticated crawler is finalized.
 */
export class UHCPayerConnector implements DataSourceConnector {
  source_id = 'payer:UHC';
  authority = 'payer';
  jurisdiction = 'US';
  payer = 'UHC';
  private readonly manifestUrl = 'https://assets.getwyng.com/payer/uhc/policies.json';

  async fetch_index(): Promise<DiscoveredDocument[]> {
    return [
      {
        url: this.manifestUrl,
        title: 'UHC Public Medical Policies',
        doc_type: 'policy',
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
      throw new Error(`Failed to fetch UHC policy manifest: ${response.status}`);
    }

    const data = await response.json();
    const serialized = JSON.stringify(data);
    const sha256 = createHash('sha256').update(serialized).digest('hex');

    return {
      url,
      title: 'UHC Public Medical Policies',
      content: serialized,
      metadata: { count: Array.isArray(data?.policies) ? data.policies.length : 0 },
      doc_type: 'policy',
      version: new Date().toISOString().slice(0, 10),
      sha256
    };
  }

  async split_to_sections(doc: ProcessedDocument): Promise<DocumentSection[]> {
    const parsed = JSON.parse(doc.content);
    const policies = Array.isArray(parsed?.policies) ? parsed.policies : [];

    return policies.map((policy: any) => {
      const text = `${policy.title}\n${policy.summary || ''}\nRevision: ${policy.revision || 'unknown'}\n${policy.url || ''}`.trim();
      return {
        section_id: randomUUID(),
        doc_id: '',
        section_path: policy.policy_id || policy.slug || policy.title,
        title: policy.title,
        text,
        tokens: Math.round(text.length / 4),
        eff_date: policy.effective_date,
        version: policy.revision,
        created_at: new Date().toISOString()
      };
    });
  }
}
