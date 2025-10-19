/**
 * eCFR Data Source Connector
 * Fetches federal regulations from Electronic Code of Federal Regulations
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import {
  DataSourceConnector,
  DiscoveredDocument,
  ProcessedDocument,
  DocumentSection
} from '@/lib/types/rag';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

export class ECFRConnector implements DataSourceConnector {
  source_id = 'ecfr';
  authority = 'federal';

  private baseUrl = 'https://www.ecfr.gov/api/v1';
  private relevantTitles = [
    { title: 26, name: 'Internal Revenue' }, // HSA/FSA rules
    { title: 29, name: 'Labor' },            // ERISA, COBRA
    { title: 42, name: 'Public Health' },   // ACA, Medicare
    { title: 45, name: 'Public Welfare' }   // HHS regulations
  ];

  /**
   * Discover relevant CFR documents
   */
  async fetch_index(): Promise<DiscoveredDocument[]> {
    console.log('🔍 Discovering eCFR documents...');
    const discovered: DiscoveredDocument[] = [];

    for (const titleInfo of this.relevantTitles) {
      try {
        // Get table of contents for title
        const tocResponse = await fetch(
          `${this.baseUrl}/titles/${titleInfo.title}/toc.json`,
          {
            headers: {
              'User-Agent': 'WyngAI/1.0 (Respectful crawler; contact@getwyng.co)',
              'Accept': 'application/json'
            }
          }
        );

        if (!tocResponse.ok) {
          console.warn(`Failed to fetch TOC for title ${titleInfo.title}:`, tocResponse.status);
          continue;
        }

        const tocData = await tocResponse.json();

        // Extract relevant parts/chapters based on health insurance keywords
        const relevantSections = this.filterRelevantSections(tocData, titleInfo.title);

        for (const section of relevantSections) {
          discovered.push({
            url: `${this.baseUrl}/titles/${titleInfo.title}/parts/${section.part}/sections/${section.section}.json`,
            title: `${titleInfo.title} CFR ${section.part}.${section.section} - ${section.title}`,
            doc_type: 'regulation',
            eff_date: section.effective_date,
            version: section.version || new Date().toISOString().split('T')[0]
          });
        }

        // Rate limiting - respect eCFR servers
        await this.delay(1000);

      } catch (error) {
        console.error(`Error fetching eCFR title ${titleInfo.title}:`, error);
      }
    }

    console.log(`📋 Discovered ${discovered.length} eCFR documents`);
    return discovered;
  }

  /**
   * Fetch and process a specific CFR document
   */
  async fetch_doc(url: string): Promise<ProcessedDocument> {
    console.log('📄 Fetching eCFR document:', url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WyngAI/1.0 (Respectful crawler; contact@getwyng.co)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch eCFR document: ${response.status}`);
    }

    const data = await response.json();

    // Extract text content from eCFR JSON structure
    const content = this.extractTextFromECFR(data);
    const title = this.extractTitle(data);

    const sha256 = crypto.createHash('sha256').update(content).digest('hex');

    return {
      url,
      title,
      content,
      metadata: {
        title_number: data.title_number,
        part_number: data.part_number,
        section_number: data.section_number,
        effective_date: data.effective_date,
        authority: data.authority,
        source: data.source
      },
      doc_type: 'regulation',
      eff_date: data.effective_date,
      version: data.version || new Date().toISOString().split('T')[0],
      sha256
    };
  }

  /**
   * Split document into manageable sections for embedding
   */
  async split_to_sections(doc: ProcessedDocument): Promise<DocumentSection[]> {
    console.log('✂️ Splitting eCFR document into sections:', doc.title);

    const sections: DocumentSection[] = [];
    const maxTokens = 800; // Target ~500-800 tokens per section

    // Split by paragraphs first
    const paragraphs = doc.content.split(/\n\s*\n/);
    let currentSection = '';
    let currentPath = '';
    let sectionCounter = 1;

    for (const paragraph of paragraphs) {
      // Check if this looks like a new section header
      const sectionMatch = paragraph.match(/^\(([a-z]|\d+)\)\s/);

      if (sectionMatch && currentSection.length > 100) {
        // Save current section
        sections.push({
          section_id: crypto.randomUUID(),
          doc_id: '', // Will be set when saving to DB
          section_path: currentPath || `Section ${sectionCounter}`,
          title: this.extractSectionTitle(currentSection),
          text: currentSection.trim(),
          tokens: this.estimateTokens(currentSection),
          eff_date: doc.eff_date,
          version: doc.version,
          created_at: new Date().toISOString()
        });

        currentSection = paragraph;
        currentPath = `${doc.metadata.part_number}.${doc.metadata.section_number}(${sectionMatch[1]})`;
        sectionCounter++;
      } else {
        currentSection += '\n\n' + paragraph;
      }

      // If section gets too long, split it
      if (this.estimateTokens(currentSection) > maxTokens) {
        sections.push({
          section_id: crypto.randomUUID(),
          doc_id: '',
          section_path: currentPath || `Section ${sectionCounter}`,
          title: this.extractSectionTitle(currentSection),
          text: currentSection.trim(),
          tokens: this.estimateTokens(currentSection),
          eff_date: doc.eff_date,
          version: doc.version,
          created_at: new Date().toISOString()
        });

        currentSection = '';
        sectionCounter++;
      }
    }

    // Don't forget the last section
    if (currentSection.trim().length > 50) {
      sections.push({
        section_id: crypto.randomUUID(),
        doc_id: '',
        section_path: currentPath || `Section ${sectionCounter}`,
        title: this.extractSectionTitle(currentSection),
        text: currentSection.trim(),
        tokens: this.estimateTokens(currentSection),
        eff_date: doc.eff_date,
        version: doc.version,
        created_at: new Date().toISOString()
      });
    }

    console.log(`📑 Split into ${sections.length} sections`);
    return sections;
  }

  /**
   * Filter TOC to find health insurance relevant sections
   */
  private filterRelevantSections(tocData: any, title: number): any[] {
    const healthInsuranceKeywords = [
      'health', 'insurance', 'medical', 'coverage', 'benefits', 'claim',
      'enrollment', 'premium', 'deductible', 'copayment', 'coinsurance',
      'network', 'provider', 'appeal', 'grievance', 'emergency',
      'surprise billing', 'transparency', 'disclosure'
    ];

    const relevantSections: any[] = [];

    // Navigate the TOC structure to find relevant sections
    if (tocData.toc && tocData.toc.parts) {
      for (const part of tocData.toc.parts) {
        if (this.containsHealthInsuranceContent(part, healthInsuranceKeywords)) {
          if (part.sections) {
            for (const section of part.sections) {
              relevantSections.push({
                part: part.number,
                section: section.number,
                title: section.title,
                effective_date: section.effective_date,
                version: section.version
              });
            }
          }
        }
      }
    }

    return relevantSections;
  }

  /**
   * Check if a CFR part contains health insurance content
   */
  private containsHealthInsuranceContent(part: any, keywords: string[]): boolean {
    const searchText = (part.title + ' ' + (part.subtitle || '')).toLowerCase();
    return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
  }

  /**
   * Extract readable text from eCFR JSON structure
   */
  private extractTextFromECFR(data: any): string {
    let text = '';

    if (data.title) {
      text += `TITLE: ${data.title}\n\n`;
    }

    if (data.content && Array.isArray(data.content)) {
      for (const item of data.content) {
        if (item.type === 'text' && item.content) {
          text += item.content + '\n\n';
        } else if (item.type === 'paragraph' && item.content) {
          text += item.content + '\n\n';
        }
      }
    } else if (typeof data.content === 'string') {
      text += data.content;
    }

    return text.trim();
  }

  /**
   * Extract title from eCFR data
   */
  private extractTitle(data: any): string {
    if (data.title) return data.title;

    const titleParts = [];
    if (data.title_number) titleParts.push(`${data.title_number} CFR`);
    if (data.part_number) titleParts.push(`Part ${data.part_number}`);
    if (data.section_number) titleParts.push(`Section ${data.section_number}`);

    return titleParts.join(' ') || 'CFR Document';
  }

  /**
   * Extract section title from content
   */
  private extractSectionTitle(content: string): string {
    // Look for section headers in the first few lines
    const lines = content.split('\n').slice(0, 3);

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10 && trimmed.length < 100) {
        // Remove common prefixes
        const cleaned = trimmed.replace(/^\([a-z]|\d+\)\s*/, '').trim();
        if (cleaned.length > 5) {
          return cleaned;
        }
      }
    }

    return 'CFR Section';
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Rate limiting helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if document needs update based on content hash
   */
  async needsUpdate(url: string, urlHash: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('documents')
      .select('url_hash')
      .eq('url', url)
      .eq('authority', this.authority)
      .single();

    if (error || !data) return true; // New document
    return data.url_hash !== urlHash;
  }
}