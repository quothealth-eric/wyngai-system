/**
 * Base Data Source Connector
 * Abstract class for implementing source-specific crawlers
 */

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

// Core interfaces
export interface DiscoveredDocument {
  url: string
  title: string
  doc_type: string
  eff_date?: string
  version?: string
  last_modified?: string
  content_hash?: string
}

export interface ProcessedDocument {
  url: string
  title: string
  content: string
  metadata: Record<string, any>
  doc_type: string
  eff_date?: string
  version?: string
  sha256: string
}

export interface DocumentSection {
  section_path?: string
  title?: string
  text: string
  tokens: number
  eff_date?: string
  version?: string
}

export interface CrawlResult {
  documents_discovered: number
  documents_processed: number
  sections_created: number
  errors: string[]
  processing_time_ms: number
}

export abstract class BaseDataSourceConnector {
  protected sourceId: string
  protected authority: string
  protected jurisdiction?: string
  protected config: any
  protected rateLimitPerHour: number
  protected lastRequestTime: number = 0
  protected requestCount: number = 0
  protected requestCountResetTime: number = Date.now()

  constructor(
    sourceId: string,
    authority: string,
    jurisdiction: string | undefined,
    config: any,
    rateLimitPerHour: number = 100
  ) {
    this.sourceId = sourceId
    this.authority = authority
    this.jurisdiction = jurisdiction
    this.config = config
    this.rateLimitPerHour = rateLimitPerHour
  }

  /**
   * Main crawl orchestration method
   */
  async crawl(): Promise<CrawlResult> {
    const startTime = Date.now()
    let documentsDiscovered = 0
    let documentsProcessed = 0
    let sectionsCreated = 0
    const errors: string[] = []

    try {
      await this.updateCrawlStatus('running')

      // Discover documents
      console.log(`[${this.sourceId}] Discovering documents...`)
      const discoveredDocs = await this.fetchIndex()
      documentsDiscovered = discoveredDocs.length
      console.log(`[${this.sourceId}] Discovered ${documentsDiscovered} documents`)

      // Process each document
      for (const discoveredDoc of discoveredDocs) {
        try {
          await this.enforceRateLimit()

          // Check if document needs updating
          const needsUpdate = await this.checkDocumentNeedsUpdate(discoveredDoc)
          if (!needsUpdate) {
            console.log(`[${this.sourceId}] Skipping ${discoveredDoc.url} - no changes`)
            continue
          }

          // Fetch and process document
          console.log(`[${this.sourceId}] Processing ${discoveredDoc.url}`)
          const processedDoc = await this.fetchDoc(discoveredDoc.url)

          // Store document metadata
          const docId = await this.storeDocument(processedDoc, discoveredDoc)

          // Split into sections and store
          const sections = await this.splitToSections(processedDoc)
          await this.storeSections(docId, sections)

          documentsProcessed++
          sectionsCreated += sections.length

          console.log(`[${this.sourceId}] Processed ${discoveredDoc.url} -> ${sections.length} sections`)

        } catch (error) {
          const errorMsg = `Failed to process ${discoveredDoc.url}: ${error}`
          console.error(`[${this.sourceId}] ${errorMsg}`)
          errors.push(errorMsg)
        }
      }

      await this.updateCrawlStatus('completed')
      console.log(`[${this.sourceId}] Crawl completed: ${documentsProcessed}/${documentsDiscovered} documents, ${sectionsCreated} sections`)

    } catch (error) {
      const errorMsg = `Crawl failed: ${error}`
      console.error(`[${this.sourceId}] ${errorMsg}`)
      errors.push(errorMsg)
      await this.updateCrawlStatus('error', errorMsg)
    }

    return {
      documents_discovered: documentsDiscovered,
      documents_processed: documentsProcessed,
      sections_created: sectionsCreated,
      errors,
      processing_time_ms: Date.now() - startTime
    }
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  abstract fetchIndex(): Promise<DiscoveredDocument[]>
  abstract fetchDoc(url: string): Promise<ProcessedDocument>
  abstract splitToSections(doc: ProcessedDocument): Promise<DocumentSection[]>

  /**
   * Rate limiting enforcement
   */
  protected async enforceRateLimit(): Promise<void> {
    const now = Date.now()

    // Reset counter every hour
    if (now - this.requestCountResetTime > 3600000) {
      this.requestCount = 0
      this.requestCountResetTime = now
    }

    // Check if we've hit the rate limit
    if (this.requestCount >= this.rateLimitPerHour) {
      const waitTime = 3600000 - (now - this.requestCountResetTime)
      console.log(`[${this.sourceId}] Rate limit reached, waiting ${waitTime}ms`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      this.requestCount = 0
      this.requestCountResetTime = Date.now()
    }

    // Ensure minimum delay between requests (prevent hammering)
    const minDelay = Math.max(1000, 3600000 / this.rateLimitPerHour)
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < minDelay) {
      await new Promise(resolve => setTimeout(resolve, minDelay - timeSinceLastRequest))
    }

    this.lastRequestTime = Date.now()
    this.requestCount++
  }

  /**
   * Check if document needs updating based on content hash
   */
  protected async checkDocumentNeedsUpdate(discoveredDoc: DiscoveredDocument): Promise<boolean> {
    if (!discoveredDoc.content_hash) return true // Always fetch if no hash available

    const { data } = await supabase
      .from('documents')
      .select('sha256')
      .eq('url', discoveredDoc.url)
      .single()

    return !data || data.sha256 !== discoveredDoc.content_hash
  }

  /**
   * Store document metadata in database
   */
  protected async storeDocument(processedDoc: ProcessedDocument, discoveredDoc: DiscoveredDocument): Promise<string> {
    const urlHash = createHash('md5').update(processedDoc.url).digest('hex')

    const documentData = {
      authority: this.authority,
      jurisdiction: this.jurisdiction,
      title: processedDoc.title,
      doc_type: processedDoc.doc_type,
      eff_date: processedDoc.eff_date ? new Date(processedDoc.eff_date) : null,
      version: processedDoc.version,
      url: processedDoc.url,
      url_hash: urlHash,
      sha256: processedDoc.sha256,
      retrieved_at: new Date()
    }

    // Upsert document (update if exists, insert if new)
    const { data, error } = await supabase
      .from('documents')
      .upsert(documentData, {
        onConflict: 'url',
        ignoreDuplicates: false
      })
      .select('doc_id')
      .single()

    if (error) {
      throw new Error(`Failed to store document: ${error.message}`)
    }

    return data.doc_id
  }

  /**
   * Store document sections with placeholder embeddings
   */
  protected async storeSections(docId: string, sections: DocumentSection[]): Promise<void> {
    // First, delete existing sections for this document
    await supabase
      .from('sections')
      .delete()
      .eq('doc_id', docId)

    // Insert new sections in batches
    const batchSize = 100
    for (let i = 0; i < sections.length; i += batchSize) {
      const batch = sections.slice(i, i + batchSize).map(section => ({
        doc_id: docId,
        section_path: section.section_path,
        title: section.title,
        text: section.text,
        tokens: section.tokens,
        eff_date: section.eff_date ? new Date(section.eff_date) : null,
        version: section.version
        // Note: embedding will be generated separately by background workers
      }))

      const { error } = await supabase
        .from('sections')
        .insert(batch)

      if (error) {
        throw new Error(`Failed to store sections batch: ${error.message}`)
      }
    }

    // Queue embedding generation for sections
    await this.queueEmbeddingGeneration(docId, sections.length)
  }

  /**
   * Queue sections for background embedding generation
   */
  protected async queueEmbeddingGeneration(docId: string, sectionCount: number): Promise<void> {
    try {
      await supabase
        .from('processing_queue')
        .insert({
          task_type: 'embedding_generation',
          doc_id: docId,
          priority: 5,
          input_data: { section_count: sectionCount }
        })
    } catch (error) {
      console.error(`[${this.sourceId}] Failed to queue embedding generation:`, error)
    }
  }

  /**
   * Update crawl status in database
   */
  protected async updateCrawlStatus(
    status: 'pending' | 'running' | 'completed' | 'error',
    errorMessage?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        last_crawl_at: new Date(),
        ...(status === 'completed' && { last_success_at: new Date() }),
        ...(status === 'error' && { last_error: errorMessage })
      }

      await supabase
        .from('crawl_status')
        .upsert({
          source_id: this.sourceId,
          ...updateData
        }, {
          onConflict: 'source_id'
        })
    } catch (error) {
      console.error(`[${this.sourceId}] Failed to update crawl status:`, error)
    }
  }

  /**
   * Utility: Generate SHA-256 hash of content
   */
  protected generateContentHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex')
  }

  /**
   * Utility: Estimate token count (rough approximation)
   */
  protected estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English text
    return Math.ceil(text.length / 4)
  }

  /**
   * Utility: Clean and normalize text
   */
  protected cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/[\r\n]+/g, '\n')      // Normalize line breaks
      .trim()
  }

  /**
   * Utility: Split text into chunks of target size
   */
  protected splitTextIntoChunks(
    text: string,
    targetTokens: number = 800,
    overlapTokens: number = 100
  ): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const chunks: string[] = []
    let currentChunk = ''
    let currentTokens = 0

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence)

      if (currentTokens + sentenceTokens > targetTokens && currentChunk) {
        chunks.push(currentChunk.trim())

        // Start new chunk with overlap
        const overlapText = this.getLastNTokens(currentChunk, overlapTokens)
        currentChunk = overlapText + sentence
        currentTokens = this.estimateTokens(currentChunk)
      } else {
        currentChunk += sentence + '. '
        currentTokens += sentenceTokens
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim())
    }

    return chunks
  }

  /**
   * Utility: Get last N tokens worth of text for overlap
   */
  private getLastNTokens(text: string, n: number): string {
    const targetChars = n * 4 // Rough token-to-char conversion
    if (text.length <= targetChars) return text

    // Try to break at sentence boundary
    const lastPart = text.slice(-targetChars)
    const sentenceBreak = lastPart.indexOf('. ')
    if (sentenceBreak > 0) {
      return lastPart.slice(sentenceBreak + 2)
    }

    return lastPart
  }
}