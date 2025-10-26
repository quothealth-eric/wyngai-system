import { createHash, randomUUID } from 'crypto';
import { DataSourceConnector, DiscoveredDocument, DocumentSection, ProcessedDocument } from '@/lib/types/rag';

/**
 * Transparency in Coverage index connector.
 * We ingest the CMS machine-readable index metadata rather than full rate files for local testing.
 */
export class TransparencyIndexConnector implements DataSourceConnector {
  source_id = 'transparency:tic';
  authority = 'transparency';
  private readonly manifest = 'https://ti-c.getwyng.com/index-sample.json';

  async fetch_index(): Promise<DiscoveredDocument[]> {
    return [
      {
        url: this.manifest,
        title: 'Transparency in Coverage Index (Sample)',
        doc_type: 'ratefile',
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
      throw new Error(`Failed to fetch TiC index manifest: ${response.status}`);
    }

    const data = await response.json();
    const serialized = JSON.stringify(data);
    const sha256 = createHash('sha256').update(serialized).digest('hex');

    return {
      url,
      title: 'Transparency in Coverage Index (Sample)',
      content: serialized,
      metadata: { count: Array.isArray(data?.files) ? data.files.length : 0 },
      doc_type: 'ratefile',
      version: new Date().toISOString().slice(0, 10),
      sha256
    };
  }

  async split_to_sections(doc: ProcessedDocument): Promise<DocumentSection[]> {
    const parsed = JSON.parse(doc.content);
    const files = Array.isArray(parsed?.files) ? parsed.files : [];

    return files.map((file: any, index: number) => {
      const text = `Plan: ${file.plan_name || 'unknown'}\nURL: ${file.url}\nLast Updated: ${file.last_updated || 'n/a'}`;
      return {
        section_id: randomUUID(),
        doc_id: '',
        section_path: file.plan_id || `ratefile-${index + 1}`,
        title: file.plan_name || `Ratefile ${index + 1}`,
        text,
        tokens: Math.round(text.length / 4),
        eff_date: file.last_updated,
        version: doc.version,
        created_at: new Date().toISOString()
      };
    });
  }
}
