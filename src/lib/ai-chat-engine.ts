import { ChatAnswer, PricedSummary, DocumentArtifact } from '@/types/analyzer';
import { SemanticSearchEngine, SearchResult } from './semantic-search-engine';
import { EnhancedOCRPipeline, ExtractedData } from './enhanced-ocr-pipeline';
import { BillAnalyzerEngine } from './bill-analyzer-engine';

export interface ChatRequest {
  message: string;
  files?: Array<{
    buffer: Buffer;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  userEmail?: string;
  sessionId?: string;
}

export interface ChatResponse {
  answer: ChatAnswer;
  pricedSummary?: PricedSummary;
  suggestedQuestions: string[];
  processingInfo: {
    filesProcessed: number;
    ocrConfidence?: number;
    searchConfidence: number;
    responseTime: number;
  };
}

export class AIChatEngine {
  private searchEngine: SemanticSearchEngine;
  private ocrPipeline: EnhancedOCRPipeline;
  private billAnalyzer: BillAnalyzerEngine;
  private isInitialized: boolean = false;

  constructor() {
    this.searchEngine = new SemanticSearchEngine();
    this.ocrPipeline = new EnhancedOCRPipeline();
    this.billAnalyzer = new BillAnalyzerEngine();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.searchEngine.initialize();
    this.isInitialized = true;
    console.log('🤖 AI Chat Engine initialized');
  }

  public async processChat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`💬 Processing chat: "${request.message.substring(0, 50)}..."`);

    try {
      // Step 1: Process uploaded files if any
      let ocrContext = '';
      let pricedSummary: PricedSummary | undefined = undefined;
      let ocrConfidence: number | undefined = undefined;

      if (request.files && request.files.length > 0) {
        console.log(`📄 Processing ${request.files.length} uploaded files`);
        const ocrResults = await this.processUploadedFiles(request.files);
        ocrContext = ocrResults.context;
        ocrConfidence = ocrResults.confidence;

        // If user uploaded bills/EOBs, also generate a priced summary
        if (this.containsBillingDocuments(request.files)) {
          try {
            const analyzerResult = await this.billAnalyzer.analyzeBills({
              files: request.files,
              userDescription: request.message,
              userEmail: request.userEmail
            });
            pricedSummary = analyzerResult.pricedSummary;
          } catch (error) {
            console.error('Bill analysis failed:', error);
            // Continue without priced summary
          }
        }
      }

      // Step 2: Route query through semantic search
      const searchResult = this.routeQuery(request.message);
      console.log(`🔍 Search confidence: ${(searchResult.confidence * 100).toFixed(1)}%`);

      // Step 3: Compose comprehensive answer
      const answer = this.composeAnswer(request.message, searchResult, ocrContext, request.message);

      // Step 4: Generate suggested follow-up questions
      const suggestedQuestions = this.generateSuggestedQuestions(searchResult, ocrContext);

      const responseTime = Date.now() - startTime;

      return {
        answer,
        pricedSummary,
        suggestedQuestions,
        processingInfo: {
          filesProcessed: request.files?.length || 0,
          ocrConfidence,
          searchConfidence: searchResult.confidence,
          responseTime
        }
      };

    } finally {
      // Cleanup OCR resources
      await this.ocrPipeline.cleanup();
    }
  }

  private async processUploadedFiles(files: ChatRequest['files']): Promise<{ context: string; confidence: number }> {
    if (!files || files.length === 0) {
      return { context: '', confidence: 0 };
    }

    let combinedContext = '';
    let totalConfidence = 0;
    let processedFiles = 0;

    for (const file of files) {
      try {
        console.log(`📄 Processing ${file.filename}...`);

        // Create temporary artifact for OCR
        const artifact: DocumentArtifact = {
          artifactId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          filename: file.filename,
          docType: this.classifyDocumentType(file.buffer, file.mimeType, file.filename),
          pages: await this.estimatePageCount(file.buffer, file.mimeType),
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes
        };

        // Extract data using OCR
        const extractedData = await this.ocrPipeline.processDocument(
          file.buffer,
          file.mimeType,
          artifact
        );

        // Convert to readable context
        const fileContext = this.formatExtractedDataAsContext(extractedData, artifact);
        combinedContext += `\n\n--- ${file.filename} ---\n${fileContext}`;

        // Estimate confidence (would use actual OCR confidence in production)
        totalConfidence += 0.85;
        processedFiles++;

        console.log(`✅ Processed ${file.filename}`);

      } catch (error) {
        console.error(`❌ Failed to process ${file.filename}:`, error);
        // Continue with other files
      }
    }

    const avgConfidence = processedFiles > 0 ? totalConfidence / processedFiles : 0;

    return {
      context: combinedContext.trim(),
      confidence: avgConfidence
    };
  }

  private routeQuery(message: string): SearchResult {
    // Clean and normalize the query
    const cleanQuery = this.cleanQuery(message);

    // Use semantic search to find best matching questions
    const searchResult = this.searchEngine.searchQuestions(cleanQuery, 3);

    // Apply confidence threshold
    const minConfidence = 0.3; // Lower threshold to be more helpful
    if (searchResult.confidence < minConfidence) {
      console.log(`⚠️ Search confidence ${(searchResult.confidence * 100).toFixed(1)}% below threshold`);
      // Still return result but mark as low confidence
    }

    return searchResult;
  }

  private composeAnswer(
    originalQuery: string,
    searchResult: SearchResult,
    ocrContext: string,
    userNarrative: string
  ): ChatAnswer {
    // Generate enhanced answer using semantic search result
    const baseAnswer = this.searchEngine.generateChatAnswer(
      originalQuery,
      searchResult,
      ocrContext,
      userNarrative
    );

    // Enhance with OCR-specific insights if available
    if (ocrContext && ocrContext.length > 100) {
      baseAnswer.answer = this.enhanceAnswerWithOCR(baseAnswer.answer, ocrContext, originalQuery);
    }

    // Add contextual phone scripts if OCR found specific data
    if (ocrContext) {
      const contextualScripts = this.generateContextualPhoneScripts(ocrContext);
      baseAnswer.phoneScripts.push(...contextualScripts);
    }

    return baseAnswer;
  }

  private enhanceAnswerWithOCR(baseAnswer: string, ocrContext: string, query: string): string {
    const queryLower = query.toLowerCase();

    // Extract specific information from OCR context
    const insights: string[] = [];

    // Look for monetary amounts
    const amounts = ocrContext.match(/\$?([0-9,]+\.?\d{0,2})/g);
    if (amounts && amounts.length > 0) {
      insights.push(`I can see amounts like ${amounts.slice(0, 3).join(', ')} in your documents.`);
    }

    // Look for provider names
    const providerMatch = ocrContext.match(/(?:provider|doctor|clinic|hospital)[:\s]*([A-Z][a-zA-Z\s]{5,30})/i);
    if (providerMatch) {
      insights.push(`I see this involves ${providerMatch[1].trim()}.`);
    }

    // Look for insurance company
    const payerMatch = ocrContext.match(/(?:aetna|cigna|blue cross|united|humana|kaiser)/i);
    if (payerMatch) {
      insights.push(`I can see this is with ${payerMatch[0]} insurance.`);
    }

    // Look for claim numbers
    const claimMatch = ocrContext.match(/(?:claim|ICN)[:\s#]*([A-Z0-9]{8,15})/i);
    if (claimMatch) {
      insights.push(`I found claim number ${claimMatch[1]} in your documents.`);
    }

    if (insights.length > 0) {
      return `${baseAnswer}\n\n**Based on your uploaded documents:** ${insights.join(' ')}`;
    }

    return baseAnswer;
  }

  private generateContextualPhoneScripts(ocrContext: string): string[] {
    const scripts: string[] = [];

    // If we found specific claim or account numbers, create targeted scripts
    const claimMatch = ocrContext.match(/(?:claim|ICN)[:\s#]*([A-Z0-9]{8,15})/i);
    const accountMatch = ocrContext.match(/(?:account|patient)[:\s#]*([A-Z0-9]{6,15})/i);

    if (claimMatch || accountMatch) {
      scripts.push(
        `Hi, I'm calling about ${claimMatch ? `claim ${claimMatch[1]}` : `account ${accountMatch?.[1]}`}. I have questions about the charges and need clarification on the billing. Can you help me review this?`
      );
    }

    // If we found high dollar amounts, suggest cost inquiry
    const amounts = ocrContext.match(/\$?([0-9,]+\.?\d{0,2})/g);
    if (amounts) {
      const largeAmounts = amounts.filter(amt => {
        const num = parseFloat(amt.replace(/[$,]/g, ''));
        return num > 500;
      });

      if (largeAmounts.length > 0) {
        scripts.push(
          `I received a bill with charges of ${largeAmounts[0]} and want to understand what services this covers. Can you provide an itemized breakdown and verify that my insurance was billed correctly?`
        );
      }
    }

    return scripts;
  }

  private generateSuggestedQuestions(searchResult: SearchResult, ocrContext: string): string[] {
    const suggestions: string[] = [];

    // Add related questions from same theme
    if (searchResult.bestMatch) {
      const themeQuestions = searchResult.matches
        .filter(match => match.themeId === searchResult.bestMatch?.themeId)
        .slice(1, 4) // Skip the first (best) match
        .map(match => match.question);

      suggestions.push(...themeQuestions);
    }

    // Add contextual suggestions based on OCR content
    if (ocrContext) {
      if (ocrContext.toLowerCase().includes('emergency')) {
        suggestions.push('What are my rights for emergency room billing?');
      }

      if (ocrContext.toLowerCase().includes('denied') || ocrContext.toLowerCase().includes('denial')) {
        suggestions.push('How do I appeal an insurance denial?');
      }

      if (ocrContext.toLowerCase().includes('deductible')) {
        suggestions.push('How does my deductible work?');
      }

      if (ocrContext.toLowerCase().includes('out of network')) {
        suggestions.push('What are my options for out-of-network charges?');
      }
    }

    // Add general helpful questions
    const generalQuestions = [
      'How do I read my EOB?',
      'What should I do about billing errors?',
      'When can I appeal insurance decisions?',
      'What are my rights under the No Surprises Act?'
    ];

    // Fill remaining slots with general questions
    while (suggestions.length < 6) {
      const randomQ = generalQuestions[Math.floor(Math.random() * generalQuestions.length)];
      if (!suggestions.includes(randomQ)) {
        suggestions.push(randomQ);
      }
    }

    return suggestions.slice(0, 6);
  }

  // Helper methods
  private cleanQuery(message: string): string {
    return message
      .trim()
      .replace(/[^\w\s?]/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private containsBillingDocuments(files: ChatRequest['files']): boolean {
    if (!files) return false;

    return files.some(file => {
      const filename = file.filename.toLowerCase();
      return filename.includes('bill') ||
             filename.includes('eob') ||
             filename.includes('statement') ||
             filename.includes('invoice') ||
             file.mimeType === 'application/pdf';
    });
  }

  private classifyDocumentType(buffer: Buffer, mimeType: string, filename: string): DocumentArtifact['docType'] {
    const text = buffer.toString('utf8', 0, Math.min(1024, buffer.length)).toLowerCase();
    const filenameLC = filename.toLowerCase();

    if (text.includes('explanation of benefits') || filenameLC.includes('eob')) {
      return 'EOB';
    }

    if (text.includes('statement') || text.includes('bill') || filenameLC.includes('bill')) {
      return 'BILL';
    }

    if (text.includes('appeal') || text.includes('denial') || filenameLC.includes('letter')) {
      return 'LETTER';
    }

    if (filenameLC.includes('portal') || filenameLC.includes('screenshot')) {
      return 'PORTAL';
    }

    return 'UNKNOWN';
  }

  private async estimatePageCount(buffer: Buffer, mimeType: string): Promise<number> {
    if (mimeType === 'application/pdf') {
      const bufferStr = buffer.toString('latin1');
      const pageMatches = bufferStr.match(/\/Type\s*\/Page[^s]/g);
      return pageMatches ? Math.max(1, pageMatches.length) : Math.max(1, Math.floor(buffer.length / 50000));
    }
    return 1;
  }

  private formatExtractedDataAsContext(extractedData: ExtractedData, artifact: DocumentArtifact): string {
    const parts: string[] = [];

    parts.push(`Document Type: ${artifact.docType}`);

    if (extractedData.providerName) {
      parts.push(`Provider: ${extractedData.providerName}`);
    }

    if (extractedData.payer) {
      parts.push(`Insurance: ${extractedData.payer}`);
    }

    if (extractedData.claimId) {
      parts.push(`Claim ID: ${extractedData.claimId}`);
    }

    if (extractedData.accountId) {
      parts.push(`Account ID: ${extractedData.accountId}`);
    }

    if (extractedData.serviceDates) {
      parts.push(`Service Date: ${extractedData.serviceDates.start}${extractedData.serviceDates.end ? ` to ${extractedData.serviceDates.end}` : ''}`);
    }

    if (extractedData.totals) {
      const totals = [];
      if (extractedData.totals.billed) totals.push(`Billed: $${(extractedData.totals.billed / 100).toFixed(2)}`);
      if (extractedData.totals.allowed) totals.push(`Allowed: $${(extractedData.totals.allowed / 100).toFixed(2)}`);
      if (extractedData.totals.planPaid) totals.push(`Plan Paid: $${(extractedData.totals.planPaid / 100).toFixed(2)}`);
      if (extractedData.totals.patientResponsibility) totals.push(`Patient Responsibility: $${(extractedData.totals.patientResponsibility / 100).toFixed(2)}`);

      if (totals.length > 0) {
        parts.push(`Amounts: ${totals.join(', ')}`);
      }
    }

    if (extractedData.lineItems.length > 0) {
      parts.push(`Services: ${extractedData.lineItems.length} line items found`);

      // Include first few line items as examples
      const sampleItems = extractedData.lineItems.slice(0, 3).map(item => {
        const itemParts = [];
        if (item.code) itemParts.push(item.code);
        if (item.description) itemParts.push(item.description);
        if (item.charge) itemParts.push(`$${(item.charge / 100).toFixed(2)}`);
        return itemParts.join(' - ');
      });

      if (sampleItems.length > 0) {
        parts.push(`Sample services: ${sampleItems.join('; ')}`);
      }
    }

    return parts.join('\n');
  }
}