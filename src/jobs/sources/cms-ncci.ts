/**
 * CMS NCCI Data Source Connector
 * Fetches NCCI (National Correct Coding Initiative) policies and manuals
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import * as cheerio from 'cheerio';
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

export class CMSNCCIConnector implements DataSourceConnector {
  source_id = 'cms_ncci';
  authority = 'cms';

  private baseUrl = 'https://www.cms.gov';
  private ncciPolicyUrl = 'https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci/ncci-policy-manual';

  /**
   * Discover NCCI policy documents
   */
  async fetch_index(): Promise<DiscoveredDocument[]> {
    console.log('🔍 Discovering CMS NCCI documents...');
    const discovered: DiscoveredDocument[] = [];

    try {
      // Fetch NCCI Policy Manual index page
      const response = await fetch(this.ncciPolicyUrl, {
        headers: {
          'User-Agent': 'WyngAI/1.0 (Medical billing research; contact@getwyng.co)',
          'Accept': 'text/html'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch NCCI index: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Find PDF links to policy manuals
      $('a[href*=".pdf"]').each((_, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().trim();

        if (href && this.isRelevantNCCIDocument(text)) {
          const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

          discovered.push({
            url: fullUrl,
            title: this.cleanDocumentTitle(text),
            doc_type: 'manual',
            version: this.extractVersion(text),
            last_modified: new Date().toISOString() // Will be updated with actual date if available
          });
        }
      });

      // Add specific high-value NCCI documents
      const specificDocuments = [
        {
          url: 'https://www.cms.gov/files/document/ncci-policy-manual-medicare-services.pdf',
          title: 'NCCI Policy Manual for Medicare Services',
          doc_type: 'manual'
        },
        {
          url: 'https://www.cms.gov/files/document/ncci-policy-manual-medicaid-services.pdf',
          title: 'NCCI Policy Manual for Medicaid Services',
          doc_type: 'manual'
        }
      ];

      for (const doc of specificDocuments) {
        if (!discovered.some(d => d.url === doc.url)) {
          discovered.push({
            ...doc,
            version: new Date().toISOString().split('T')[0]
          });
        }
      }

      await this.delay(1000); // Respectful crawling

    } catch (error) {
      console.error('Error discovering NCCI documents:', error);
    }

    console.log(`📋 Discovered ${discovered.length} NCCI documents`);
    return discovered;
  }

  /**
   * Fetch and process NCCI PDF document
   */
  async fetch_doc(url: string): Promise<ProcessedDocument> {
    console.log('📄 Fetching NCCI document:', url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WyngAI/1.0 (Medical billing research; contact@getwyng.co)',
        'Accept': 'application/pdf'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch NCCI document: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    // For this implementation, we'll use a placeholder for PDF extraction
    // In production, you'd use a PDF parsing library like pdf-parse
    const content = await this.extractTextFromPDF(buffer);

    const title = this.extractTitleFromUrl(url);
    const sha256 = crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');

    return {
      url,
      title,
      content,
      metadata: {
        source: 'cms_ncci',
        pdf_pages: this.estimatePageCount(buffer),
        file_size: buffer.byteLength
      },
      doc_type: 'manual',
      version: new Date().toISOString().split('T')[0],
      sha256
    };
  }

  /**
   * Split NCCI document into sections
   */
  async split_to_sections(doc: ProcessedDocument): Promise<DocumentSection[]> {
    console.log('✂️ Splitting NCCI document into sections:', doc.title);

    const sections: DocumentSection[] = [];
    const maxTokens = 800;

    // NCCI documents typically have chapter/section structure
    const chapterSections = this.splitByChapters(doc.content);

    for (let i = 0; i < chapterSections.length; i++) {
      const chapter = chapterSections[i];

      if (this.estimateTokens(chapter.content) <= maxTokens) {
        // Chapter fits in one section
        sections.push({
          section_id: crypto.randomUUID(),
          doc_id: '',
          section_path: chapter.path,
          title: chapter.title,
          text: chapter.content.trim(),
          tokens: this.estimateTokens(chapter.content),
          version: doc.version,
          created_at: new Date().toISOString()
        });
      } else {
        // Split large chapters into subsections
        const subsections = this.splitLargeChapter(chapter, maxTokens);
        sections.push(...subsections);
      }
    }

    console.log(`📑 Split into ${sections.length} sections`);
    return sections;
  }

  /**
   * Check if document title indicates relevance to NCCI policies
   */
  private isRelevantNCCIDocument(title: string): boolean {
    const relevantKeywords = [
      'ncci', 'policy manual', 'correct coding', 'bundling', 'unbundling',
      'modifier', 'edit', 'ptp', 'mue', 'medicare', 'medicaid'
    ];

    const titleLower = title.toLowerCase();
    return relevantKeywords.some(keyword => titleLower.includes(keyword));
  }

  /**
   * Clean document title for storage
   */
  private cleanDocumentTitle(title: string): string {
    return title
      .replace(/\s+/g, ' ')
      .replace(/[\(\)]/g, '')
      .trim()
      .substring(0, 200);
  }

  /**
   * Extract version from document title or filename
   */
  private extractVersion(text: string): string {
    const versionMatch = text.match(/v(\d+\.?\d*)|version\s*(\d+\.?\d*)|(\d{4})/i);
    if (versionMatch) {
      return versionMatch[1] || versionMatch[2] || versionMatch[3];
    }
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Extract title from URL when document title is not available
   */
  private extractTitleFromUrl(url: string): string {
    const filename = url.split('/').pop() || '';
    return filename
      .replace(/\.(pdf|html)$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Extract text from PDF buffer (placeholder implementation)
   */
  private async extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
    // This is a placeholder - in production, use pdf-parse or similar
    // For now, return a structured placeholder that indicates PDF content

    const size = buffer.byteLength;
    const estimatedPages = Math.ceil(size / 50000); // Rough estimate

    return `NCCI Policy Manual Content

This document contains CMS National Correct Coding Initiative policies and procedures.

Key topics typically covered:
- Code pair edits and bundling rules
- Modifier usage guidelines
- Medical necessity requirements
- Claims processing standards
- Appeal and review procedures

Document size: ${size} bytes
Estimated pages: ${estimatedPages}

[Full PDF text extraction would be implemented here using pdf-parse library]

For complete content, refer to the original PDF document at the source URL.`;
  }

  /**
   * Split content by chapter/section headers
   */
  private splitByChapters(content: string): Array<{path: string, title: string, content: string}> {
    const chapters: Array<{path: string, title: string, content: string}> = [];

    // Look for chapter headers (common patterns in NCCI documents)
    const chapterPattern = /(?:^|\n)(Chapter\s+\d+|Section\s+[A-Z]|Part\s+[IVX]+)[\s\-:]*([^\n]+)/gi;

    let lastIndex = 0;
    let match;
    let chapterCount = 1;

    while ((match = chapterPattern.exec(content)) !== null) {
      // Save previous chapter if it exists
      if (lastIndex > 0) {
        const previousContent = content.substring(lastIndex, match.index).trim();
        if (previousContent.length > 100) {
          chapters.push({
            path: `Chapter ${chapterCount - 1}`,
            title: `NCCI Chapter ${chapterCount - 1}`,
            content: previousContent
          });
        }
      }

      lastIndex = match.index;
      chapterCount++;
    }

    // Add the last chapter
    if (lastIndex < content.length) {
      const lastContent = content.substring(lastIndex).trim();
      if (lastContent.length > 100) {
        chapters.push({
          path: `Chapter ${chapterCount}`,
          title: `NCCI Chapter ${chapterCount}`,
          content: lastContent
        });
      }
    }

    // If no chapters found, treat whole document as one section
    if (chapters.length === 0) {
      chapters.push({
        path: 'Full Document',
        title: 'NCCI Policy Manual',
        content: content
      });
    }

    return chapters;
  }

  /**
   * Split large chapters into smaller subsections
   */
  private splitLargeChapter(
    chapter: {path: string, title: string, content: string},
    maxTokens: number
  ): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const paragraphs = chapter.content.split(/\n\s*\n/);

    let currentSection = '';
    let sectionCount = 1;

    for (const paragraph of paragraphs) {
      const testSection = currentSection + '\n\n' + paragraph;

      if (this.estimateTokens(testSection) > maxTokens && currentSection.length > 100) {
        // Save current section
        sections.push({
          section_id: crypto.randomUUID(),
          doc_id: '',
          section_path: `${chapter.path}.${sectionCount}`,
          title: `${chapter.title} - Part ${sectionCount}`,
          text: currentSection.trim(),
          tokens: this.estimateTokens(currentSection),
          created_at: new Date().toISOString()
        });

        currentSection = paragraph;
        sectionCount++;
      } else {
        currentSection = testSection;
      }
    }

    // Add final section
    if (currentSection.trim().length > 50) {
      sections.push({
        section_id: crypto.randomUUID(),
        doc_id: '',
        section_path: `${chapter.path}.${sectionCount}`,
        title: `${chapter.title} - Part ${sectionCount}`,
        text: currentSection.trim(),
        tokens: this.estimateTokens(currentSection),
        created_at: new Date().toISOString()
      });
    }

    return sections;
  }

  /**
   * Estimate page count from buffer size
   */
  private estimatePageCount(buffer: ArrayBuffer): number {
    // Rough estimate: 50KB per page for typical PDF
    return Math.ceil(buffer.byteLength / 50000);
  }

  /**
   * Estimate token count
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Rate limiting helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}