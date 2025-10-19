/**
 * WyngAI Central Assistant - Crawler Scheduler
 * Manages automated data source crawling and updates
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { ECFRConnector } from './sources/ecfr';
import { CMSNCCIConnector } from './sources/cms-ncci';
import {
  DataSourceConnector,
  DocumentMetadata,
  DocumentSection,
  ProcessedDocument,
  CrawlStatus,
  ChangeLogEntry
} from '@/lib/types/rag';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export class CrawlerScheduler {
  private connectors: Map<string, DataSourceConnector>;

  constructor() {
    this.connectors = new Map();
    this.registerConnectors();
  }

  /**
   * Register all available data source connectors
   */
  private registerConnectors() {
    this.connectors.set('ecfr', new ECFRConnector());
    this.connectors.set('cms_ncci', new CMSNCCIConnector());

    // Additional connectors would be registered here:
    // this.connectors.set('state_doi_ca', new StateDOIConnector('CA'));
    // this.connectors.set('healthcare_gov', new HealthcareGovConnector());
    // this.connectors.set('payer_uhc', new PayerConnector('UnitedHealthcare'));
  }

  /**
   * Run scheduled crawls based on crawler status
   */
  async runScheduledCrawls(): Promise<void> {
    console.log('🚀 Starting scheduled crawl run...');

    try {
      // Get crawlers that are due for execution
      const { data: dueCrawlers, error } = await supabase
        .from('crawl_status')
        .select('*')
        .or('next_scheduled_at.lt.now(),next_scheduled_at.is.null')
        .eq('status', 'pending')
        .order('last_success_at', { ascending: true }); // Prioritize least recently successful

      if (error) {
        console.error('Error fetching due crawlers:', error);
        return;
      }

      console.log(`📅 Found ${dueCrawlers?.length || 0} crawlers due for execution`);

      for (const crawlerStatus of dueCrawlers || []) {
        try {
          await this.runCrawler(crawlerStatus.source_id);
        } catch (error) {
          console.error(`Error running crawler ${crawlerStatus.source_id}:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await this.updateCrawlStatus(crawlerStatus.source_id, 'error', errorMessage);
        }
      }

    } catch (error) {
      console.error('Error in scheduled crawl run:', error);
    }

    console.log('✅ Scheduled crawl run completed');
  }

  /**
   * Run a specific crawler
   */
  async runCrawler(sourceId: string): Promise<void> {
    console.log(`🕷️ Running crawler: ${sourceId}`);

    const connector = this.connectors.get(sourceId);
    if (!connector) {
      throw new Error(`Connector not found for source: ${sourceId}`);
    }

    // Update status to running
    await this.updateCrawlStatus(sourceId, 'running');

    try {
      // Step 1: Discover documents
      const discoveredDocs = await connector.fetch_index();
      console.log(`📋 Discovered ${discoveredDocs.length} documents for ${sourceId}`);

      let newDocs = 0;
      let updatedDocs = 0;
      let totalSections = 0;

      // Step 2: Process each discovered document
      for (const discoveredDoc of discoveredDocs) {
        try {
          const urlHash = this.generateUrlHash(discoveredDoc.url);
          const needsUpdate = await this.checkIfNeedsUpdate(discoveredDoc.url, urlHash, connector.authority);

          if (!needsUpdate) {
            console.log(`⏭️ Skipping unchanged document: ${discoveredDoc.title}`);
            continue;
          }

          // Step 3: Fetch and process document
          const processedDoc = await connector.fetch_doc(discoveredDoc.url);

          // Step 4: Save document metadata
          const docMetadata = await this.saveDocumentMetadata(processedDoc, connector, urlHash);

          // Step 5: Split into sections and save
          const sections = await connector.split_to_sections(processedDoc);
          await this.saveSections(sections, docMetadata.doc_id);

          // Step 6: Generate embeddings for new sections
          await this.generateEmbeddings(sections);

          if (needsUpdate === 'new') {
            newDocs++;
          } else {
            updatedDocs++;
          }
          totalSections += sections.length;

          // Rate limiting between documents
          await this.delay(2000);

        } catch (error) {
          console.error(`Error processing document ${discoveredDoc.url}:`, error);
          // Continue with other documents
        }
      }

      // Step 7: Update crawler status
      await this.updateCrawlStatus(sourceId, 'completed', undefined, {
        new_documents: newDocs,
        updated_documents: updatedDocs,
        total_sections: totalSections
      });

      // Step 8: Log changes
      await this.logChanges(sourceId, connector.authority, newDocs, updatedDocs, totalSections);

      console.log(`✅ Crawler ${sourceId} completed: ${newDocs} new, ${updatedDocs} updated, ${totalSections} sections`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateCrawlStatus(sourceId, 'error', errorMessage);
      throw error;
    }
  }

  /**
   * Check if document needs updating
   */
  private async checkIfNeedsUpdate(url: string, urlHash: string, authority: string): Promise<boolean | 'new'> {
    const { data, error } = await supabase
      .from('documents')
      .select('url_hash, doc_id')
      .eq('url', url)
      .eq('authority', authority)
      .single();

    if (error || !data) {
      return 'new'; // New document
    }

    return data.url_hash !== urlHash; // Changed document
  }

  /**
   * Save document metadata to database
   */
  private async saveDocumentMetadata(
    doc: ProcessedDocument,
    connector: DataSourceConnector,
    urlHash: string
  ): Promise<DocumentMetadata> {
    const docData = {
      authority: connector.authority,
      jurisdiction: connector.jurisdiction,
      title: doc.title,
      doc_type: doc.doc_type,
      eff_date: doc.eff_date,
      version: doc.version,
      url: doc.url,
      url_hash: urlHash,
      sha256: doc.sha256,
      storage_path: null, // Could store PDF/HTML in Supabase Storage
      retrieved_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('documents')
      .upsert(docData, {
        onConflict: 'url,authority'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save document metadata: ${error.message}`);
    }

    return data;
  }

  /**
   * Save document sections to database
   */
  private async saveSections(sections: DocumentSection[], docId: string): Promise<void> {
    // Delete existing sections for this document
    await supabase
      .from('sections')
      .delete()
      .eq('doc_id', docId);

    // Insert new sections
    const sectionsData = sections.map(section => ({
      ...section,
      doc_id: docId,
      section_id: undefined // Let DB generate new IDs
    }));

    const { error } = await supabase
      .from('sections')
      .insert(sectionsData);

    if (error) {
      throw new Error(`Failed to save sections: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for sections
   */
  private async generateEmbeddings(sections: DocumentSection[]): Promise<void> {
    console.log(`🧠 Generating embeddings for ${sections.length} sections...`);

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < sections.length; i += batchSize) {
      const batch = sections.slice(i, i + batchSize);

      try {
        // Generate embeddings for batch
        const texts = batch.map(section => section.text);
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-large',
          input: texts,
          dimensions: 1536
        });

        // Update sections with embeddings
        for (let j = 0; j < batch.length; j++) {
          const section = batch[j];
          const embedding = response.data[j].embedding;

          const { error } = await supabase
            .from('sections')
            .update({ embedding })
            .eq('doc_id', section.doc_id)
            .eq('text', section.text); // Match by text since section_id might be auto-generated

          if (error) {
            console.error(`Error updating embedding for section:`, error);
          }
        }

        // Rate limit embeddings API
        await this.delay(1000);

      } catch (error) {
        console.error('Error generating embeddings for batch:', error);
        // Continue with other batches
      }
    }

    console.log('✅ Embeddings generation completed');
  }

  /**
   * Update crawler status in database
   */
  private async updateCrawlStatus(
    sourceId: string,
    status: 'pending' | 'running' | 'completed' | 'error',
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const updateData: Partial<CrawlStatus> = {
      status,
      last_crawl_at: new Date().toISOString()
    };

    if (status === 'completed') {
      updateData.last_success_at = new Date().toISOString();
      updateData.next_scheduled_at = this.calculateNextRun(sourceId);
    }

    if (status === 'error') {
      updateData.last_error = errorMessage;
      updateData.next_scheduled_at = this.calculateNextRun(sourceId, true); // Shorter retry interval
    }

    if (metadata) {
      updateData.metadata = metadata;
      updateData.documents_count = metadata.new_documents + metadata.updated_documents;
      updateData.sections_count = metadata.total_sections;
    }

    const { error } = await supabase
      .from('crawl_status')
      .upsert({
        source_id: sourceId,
        ...updateData
      }, {
        onConflict: 'source_id'
      });

    if (error) {
      console.error('Error updating crawl status:', error);
    }
  }

  /**
   * Log changes to change log table
   */
  private async logChanges(
    sourceId: string,
    authority: string,
    newDocs: number,
    updatedDocs: number,
    totalSections: number
  ): Promise<void> {
    if (newDocs === 0 && updatedDocs === 0) return;

    const changeType = newDocs > 0 && updatedDocs > 0 ? 'new_and_updated' :
                     newDocs > 0 ? 'new_doc' : 'updated_doc';

    const description = `${sourceId}: ${newDocs} new documents, ${updatedDocs} updated documents, ${totalSections} total sections`;

    const { error } = await supabase
      .from('change_log')
      .insert({
        authority,
        change_type: changeType,
        description,
        doc_count: newDocs + updatedDocs,
        section_count: totalSections
      });

    if (error) {
      console.error('Error logging changes:', error);
    }
  }

  /**
   * Calculate next run time based on source frequency
   */
  private calculateNextRun(sourceId: string, isRetry = false): string {
    const frequencies: Record<string, number> = {
      'ecfr': 7 * 24 * 60 * 60 * 1000,        // Weekly
      'cms_ncci': 7 * 24 * 60 * 60 * 1000,    // Weekly
      'healthcare_gov': 24 * 60 * 60 * 1000,   // Daily
      'state_doi': 24 * 60 * 60 * 1000,        // Daily
      'payer': 24 * 60 * 60 * 1000             // Daily
    };

    const baseFrequency = frequencies[sourceId] || 24 * 60 * 60 * 1000; // Default to daily
    const frequency = isRetry ? Math.min(baseFrequency, 4 * 60 * 60 * 1000) : baseFrequency; // Max 4 hour retry

    return new Date(Date.now() + frequency).toISOString();
  }

  /**
   * Generate URL hash for change detection
   */
  private generateUrlHash(url: string): string {
    const { createHash } = require('crypto');
    return createHash('md5').update(url).digest('hex');
  }

  /**
   * Rate limiting helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Initialize crawler statuses for all registered connectors
   */
  async initializeCrawlerStatuses(): Promise<void> {
    console.log('🔧 Initializing crawler statuses...');

    for (const [sourceId, connector] of this.connectors) {
      const { data, error } = await supabase
        .from('crawl_status')
        .select('source_id')
        .eq('source_id', sourceId)
        .single();

      if (error || !data) {
        // Create initial status
        await supabase
          .from('crawl_status')
          .insert({
            source_id: sourceId,
            status: 'pending',
            documents_count: 0,
            sections_count: 0,
            next_scheduled_at: new Date().toISOString(), // Run immediately
            crawl_frequency: this.getDefaultFrequency(sourceId),
            metadata: {
              authority: connector.authority,
              jurisdiction: connector.jurisdiction
            }
          });

        console.log(`📝 Initialized crawler status for ${sourceId}`);
      }
    }
  }

  /**
   * Get default crawl frequency for source
   */
  private getDefaultFrequency(sourceId: string): string {
    const frequencies: Record<string, string> = {
      'ecfr': '7 days',
      'cms_ncci': '7 days',
      'healthcare_gov': '1 day',
      'state_doi': '1 day',
      'payer': '1 day'
    };

    return frequencies[sourceId] || '1 day';
  }

  /**
   * Clean up old RAG cache entries
   */
  async cleanupCache(): Promise<void> {
    console.log('🧹 Cleaning up expired RAG cache...');

    const { error } = await supabase
      .from('rag_cache')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      console.error('Error cleaning up cache:', error);
    } else {
      console.log('✅ Cache cleanup completed');
    }
  }
}