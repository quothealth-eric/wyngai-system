/**
 * WyngAI Central Assistant - RAG System Exports
 * Main entry point for all RAG functionality
 */

// Core RAG Components
export { RAGRetriever } from './retriever';
export { QueryUnderstanding } from './query-understanding';
export { AnswerComposer } from './answer-composer';

// Data Source Connectors
export { ECFRConnector } from '../jobs/sources/ecfr';
export { CMSNCCIConnector } from '../jobs/sources/cms-ncci';
export { CrawlerScheduler } from '../jobs/crawler-scheduler';

// Tools and Utilities
export { insuranceCalculators, InsuranceCalculators } from '../tools/calculators';
export { EnhancedOCRPipeline } from '../ocr/enhanced-pipeline';

// Types
export * from '../types/rag';

// Database utilities
export { MATCH_SECTIONS_SQL } from './retriever';

/**
 * WyngAI Central Assistant Main Class
 * Orchestrates all RAG functionality
 */
import { RAGRetriever } from './retriever';
import { QueryUnderstanding } from './query-understanding';
import { AnswerComposer } from './answer-composer';
import { InsuranceCalculators } from '../tools/calculators';
import { EnhancedOCRPipeline } from '../ocr/enhanced-pipeline';
import {
  ChatResponse,
  ChatContext,
  ExtractedEntities,
  RAGQuery,
  UploadedFile
} from '../types/rag';

export class WyngAICentralAssistant {
  private queryUnderstanding: QueryUnderstanding;
  private retriever: RAGRetriever;
  private answerComposer: AnswerComposer;
  private calculators: InsuranceCalculators;
  private ocrPipeline: EnhancedOCRPipeline;

  constructor() {
    this.queryUnderstanding = new QueryUnderstanding();
    this.retriever = new RAGRetriever();
    this.answerComposer = new AnswerComposer();
    this.calculators = new InsuranceCalculators();
    this.ocrPipeline = new EnhancedOCRPipeline();
  }

  /**
   * Process a complete user query with optional file uploads
   */
  async processQuery(
    text: string,
    context: ChatContext,
    files?: File[]
  ): Promise<{
    response: ChatResponse;
    updatedContext: ChatContext;
    processedFiles?: UploadedFile[];
  }> {
    console.log('🤖 WyngAI Central Assistant processing query...');

    // Process file uploads if any
    let processedFiles: UploadedFile[] | undefined;
    if (files && files.length > 0) {
      processedFiles = [];
      for (const file of files) {
        const processed = await this.ocrPipeline.processFile(file, file.name);
        processedFiles.push(processed);

        // Update context with extracted data
        if (processed.extracted_data?.plan_info) {
          context.planInputs = {
            ...context.planInputs,
            ...processed.extracted_data.plan_info
          };
        }
      }
    }

    // Extract entities from query
    const entities = await this.queryUnderstanding.extractEntities(text, context);

    // Update context with new information
    const updatedContext = this.queryUnderstanding.updateContext(context, entities);

    // Check if clarification is needed
    const clarification = this.queryUnderstanding.shouldClarify(entities, updatedContext);

    if (clarification.needsClarification) {
      return {
        response: {
          answer: clarification.clarificationQuestion!,
          citations: [],
          nextSteps: ['Please provide the requested information for accurate guidance'],
          scripts: [],
          forms: [],
          confidence: 0.9,
          authorities_used: [],
          clarification: {
            question: clarification.clarificationQuestion!,
            intent: 'collect_missing_info',
            options: entities.planType ? undefined : ['HMO', 'PPO', 'EPO', 'HDHP', 'POS']
          }
        },
        updatedContext,
        processedFiles
      };
    }

    // Build RAG query
    const ragQuery: RAGQuery = {
      text,
      entities,
      context: updatedContext
    };

    // Perform retrieval
    const retrievalResult = await this.retriever.retrieve(ragQuery);

    // Compose answer
    const response = await this.answerComposer.composeAnswer(
      text,
      entities,
      retrievalResult,
      updatedContext
    );

    // Update context with last answer
    updatedContext.lastAnswer = response;

    console.log('✅ WyngAI Central Assistant processing complete');

    return {
      response,
      updatedContext,
      processedFiles
    };
  }

  /**
   * Calculate insurance costs and scenarios
   */
  getCalculators(): InsuranceCalculators {
    return this.calculators;
  }

  /**
   * Process files with OCR
   */
  async processFiles(files: File[]): Promise<UploadedFile[]> {
    const results: UploadedFile[] = [];

    for (const file of files) {
      const processed = await this.ocrPipeline.processFile(file, file.name);
      results.push(processed);
    }

    return results;
  }

  /**
   * Get system capabilities
   */
  getCapabilities(): string[] {
    return [
      'Multi-turn conversations with context preservation',
      'Authoritative source citations (Federal, CMS, State DOI, Payer)',
      'Plan-specific guidance and calculations',
      'File upload processing with OCR (EOBs, bills, cards)',
      'No Surprises Act compliance checking',
      'Cost estimation and benefit calculations',
      'Appeal letter and form generation',
      'Phone scripts for contacting insurers',
      'Real-time policy updates from authoritative sources'
    ];
  }

  /**
   * Get supported document types
   */
  getSupportedDocumentTypes(): string[] {
    return [
      'Explanation of Benefits (EOB)',
      'Medical bills and statements',
      'Insurance ID cards',
      'Prior authorization forms',
      'Appeal letters and correspondence',
      'Coverage documents and EOCs'
    ];
  }
}

/**
 * Create a singleton instance for easy access
 */
export const wyngaiAssistant = new WyngAICentralAssistant();