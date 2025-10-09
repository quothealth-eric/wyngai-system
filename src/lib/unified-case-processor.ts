import crypto from 'crypto';
import { UnifiedCaseInput, DocumentArtifact, Narrative, BenefitsContext, AnalyzerResult, DocumentMeta, LineItem, PricedSummary, Detection } from '@/types/analyzer';
import { EnhancedDocumentParser } from './enhanced-document-parser';
import { ComprehensiveDetectionEngine } from './comprehensive-detection-engine';
import { BenefitsAwareMathEngine } from './benefits-aware-math-engine';
import { PricedSummaryGenerator } from './priced-summary-generator';
import { EnhancedGuidanceGenerator } from './enhanced-guidance-generator';
import { EmailGate } from './email-gate';

export interface ProcessingInput {
  files: Array<{ buffer: Buffer; filename: string; mimeType: string }>;
  userEmail?: string;
  userDescription?: string;
  benefits?: BenefitsContext;
  clientIP?: string;
}

export class UnifiedCaseProcessor {
  private documentParser: EnhancedDocumentParser;
  private detectionEngine: ComprehensiveDetectionEngine;
  private mathEngine: BenefitsAwareMathEngine;
  private summaryGenerator: PricedSummaryGenerator;
  private guidanceGenerator: EnhancedGuidanceGenerator;
  private fileDataMap: Map<string, { buffer: Buffer; mimeType: string }> = new Map();

  constructor() {
    this.documentParser = new EnhancedDocumentParser();
    this.detectionEngine = new ComprehensiveDetectionEngine();
    this.mathEngine = new BenefitsAwareMathEngine();
    this.summaryGenerator = new PricedSummaryGenerator();
    this.guidanceGenerator = new EnhancedGuidanceGenerator();
  }

  public async processCase(input: ProcessingInput): Promise<AnalyzerResult> {
    console.log('🔄 Starting unified case processing...');

    // Reset document parser for new case to ensure clean state
    this.documentParser.resetCaseContext();
    this.fileDataMap.clear();
    console.log('🔄 Reset document parser context for new case');

    // Step 1: Rate limiting and email gating
    if (input.clientIP) {
      const ipAllowed = await EmailGate.checkIPRateLimit(input.clientIP);
      if (!ipAllowed) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
    }

    let emailGateResult = { emailOk: true };
    if (input.userEmail) {
      emailGateResult = await EmailGate.checkEmailAccess(input.userEmail);
      if (emailGateResult.emailOk) {
        await EmailGate.recordUsage(input.userEmail);
      }
    }

    // Step 2: Create document artifacts
    const artifacts = await this.createDocumentArtifacts(input.files);
    console.log(`📄 Created ${artifacts.length} document artifacts`);

    // Step 3: Build narrative from user description
    const narrative = this.buildNarrative(input.userDescription || '');

    // Step 4: Create unified case input
    const caseId = this.generateCaseId();
    const unifiedInput: UnifiedCaseInput = {
      caseId,
      artifacts,
      narrative,
      benefits: input.benefits,
      inferred: await this.inferCaseContext(artifacts, narrative)
    };

    console.log(`🎯 Processing case ${caseId} with ${artifacts.length} documents`);

    // Step 5: Parse and extract from all documents
    const { documentMetas, allLineItems } = await this.parseAllDocuments(artifacts);

    // Step 6: Match bills to EOBs and normalize
    const { matchedDocuments, normalizedLineItems } = await this.matchAndNormalize(documentMetas, allLineItems);

    // Step 7: Run detection engine (no-benefits mode)
    console.log('🔍 Running comprehensive detection rules...');
    const detections = await this.detectionEngine.runAllDetections(normalizedLineItems, matchedDocuments, unifiedInput);

    // Step 8: Run benefits-aware math (if benefits provided)
    let benefitsDetections: Detection[] = [];
    if (input.benefits) {
      console.log('💰 Running benefits-aware math calculations...');
      benefitsDetections = await this.mathEngine.calculateBenefitsMath(normalizedLineItems, matchedDocuments, input.benefits);
    }

    // Step 9: Combine all detections
    const allDetections = [...detections, ...benefitsDetections];

    // Step 10: Generate priced summary
    console.log('📊 Generating priced summary table...');
    const pricedSummary = this.summaryGenerator.generateSummary(matchedDocuments, normalizedLineItems);

    // Step 11: Generate guidance and next actions
    console.log('📋 Generating guidance and action items...');
    const guidance = this.guidanceGenerator.generateGuidance(allDetections, matchedDocuments, input.benefits);
    const nextActions = this.guidanceGenerator.generateNextActions(allDetections, matchedDocuments);

    // Step 12: Calculate confidence scores
    const confidence = this.calculateOverallConfidence(matchedDocuments, normalizedLineItems, allDetections);

    // Step 13: Build final result
    const result: AnalyzerResult = {
      documentMeta: matchedDocuments,
      lineItems: normalizedLineItems,
      pricedSummary,
      detections: allDetections,
      confidence,
      complianceFooters: []
    };

    console.log(`✅ Case processing complete: ${allDetections.length} detections, confidence ${confidence.overall}%`);
    return result;
  }

  private async createDocumentArtifacts(files: Array<{ buffer: Buffer; filename: string; mimeType: string }>): Promise<DocumentArtifact[]> {
    const artifacts: DocumentArtifact[] = [];

    for (const file of files) {
      const artifactId = this.generateArtifactId();
      const docType = this.classifyDocumentType(file.buffer, file.mimeType) as "EOB" | "BILL" | "LETTER" | "PORTAL" | "UNKNOWN";

      // Store file data for later use in parsing
      this.fileDataMap.set(artifactId, {
        buffer: file.buffer,
        mimeType: file.mimeType
      });

      artifacts.push({
        artifactId,
        filename: file.filename,
        mime: file.mimeType,
        docType,
        pages: await this.estimatePageCount(file.buffer, file.mimeType),
        ocrConf: 0.85 // Will be updated during OCR
      });
    }

    return artifacts;
  }

  private buildNarrative(userDescription: string): Narrative {
    const text = userDescription.trim();
    const tags: string[] = [];

    // Extract tags from user description
    if (/emergency|ER|urgent/i.test(text)) tags.push('ER');
    if (/anesthesia|anesthetist/i.test(text)) tags.push('anesthesia');
    if (/surprise.*bill|unexpected.*bill/i.test(text)) tags.push('surpriseBill');
    if (/out.*network|OON/i.test(text)) tags.push('outOfNetwork');
    if (/facility.*fee/i.test(text)) tags.push('facilityFee');
    if (/preventive|screening|annual/i.test(text)) tags.push('preventive');

    return { text, tags };
  }

  private async inferCaseContext(artifacts: DocumentArtifact[], narrative: Narrative) {
    const inferred: UnifiedCaseInput['inferred'] = {};

    // Infer facility type from narrative tags
    if (narrative.tags?.includes('ER')) {
      inferred.facilityType = 'ER';
      inferred.emergency = true;
    }

    // Check for NSA candidate scenarios
    if (narrative.tags?.includes('surpriseBill') || narrative.tags?.includes('outOfNetwork')) {
      inferred.nsaCandidate = true;
    }

    // Identify potential ancillary vendors
    if (narrative.tags?.includes('anesthesia')) {
      inferred.ancillaryVendors = ['anesthesia'];
    }

    return inferred;
  }

  private async parseAllDocuments(artifacts: DocumentArtifact[]): Promise<{ documentMetas: DocumentMeta[], allLineItems: LineItem[] }> {
    const documentMetas: DocumentMeta[] = [];
    const allLineItems: LineItem[] = [];

    for (const artifact of artifacts) {
      try {
        console.log(`📄 Parsing artifact ${artifact.artifactId}: ${artifact.filename}`);

        // Parse document using enhanced parser with real file data
        const fileData = this.fileDataMap.get(artifact.artifactId);
        const parsed = await this.documentParser.parseDocument(artifact);

        documentMetas.push(parsed.documentMeta);
        allLineItems.push(...parsed.lineItems);

      } catch (error) {
        console.error(`❌ Failed to parse ${artifact.filename}:`, error);
        // Continue with other documents
      }
    }

    return { documentMetas, allLineItems };
  }

  private async matchAndNormalize(documentMetas: DocumentMeta[], lineItems: LineItem[]): Promise<{ matchedDocuments: DocumentMeta[], normalizedLineItems: LineItem[] }> {
    console.log('🔗 Matching bills to EOBs and normalizing data...');

    // For now, return as-is. In full implementation, this would:
    // 1. Match bills to EOBs by claim ID, DOS, provider, amounts
    // 2. Normalize money values to cents
    // 3. Standardize dates to ISO format
    // 4. Validate and clean code formats

    return {
      matchedDocuments: documentMetas,
      normalizedLineItems: lineItems
    };
  }

  private classifyDocumentType(buffer: Buffer, mimeType: string): "EOB" | "BILL" | "LETTER" | "PORTAL" | "UNKNOWN" {
    // Convert first 2KB to text for classification
    const text = buffer.toString('utf8', 0, Math.min(2048, buffer.length)).toLowerCase();

    // EOB markers
    if (text.includes('explanation of benefits') ||
        text.includes('eob') ||
        text.includes('allowed amount') ||
        text.includes('plan paid') ||
        text.includes('patient responsibility')) {
      return 'EOB';
    }

    // Bill markers
    if (text.includes('itemized') ||
        text.includes('statement') ||
        text.includes('account') ||
        text.includes('balance due') ||
        text.includes('charges')) {
      return 'BILL';
    }

    return 'UNKNOWN';
  }

  private async estimatePageCount(buffer: Buffer, mimeType: string): Promise<number> {
    if (mimeType === 'application/pdf') {
      // Look for page count indicators in PDF header/structure
      const bufferStr = buffer.toString('latin1');

      // Count PDF page objects - basic detection
      const pageMatches = bufferStr.match(/\/Type\s*\/Page[^s]/g);
      if (pageMatches && pageMatches.length > 0) {
        return Math.max(1, pageMatches.length);
      }

      // Fallback to size-based estimation (roughly 50KB per page)
      const estimatedPages = Math.max(1, Math.floor(buffer.length / 50000));
      console.log(`📄 PDF page estimation: ${estimatedPages} pages based on ${(buffer.length / 1024).toFixed(1)}KB file size`);
      return estimatedPages;
    }
    return 1; // Images are single page
  }

  private generateCaseId(): string {
    return `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateArtifactId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateOverallConfidence(documents: DocumentMeta[], lineItems: LineItem[], detections: Detection[]): { overall: number; sections?: { [k: string]: number } } {
    const ocrConf = 85; // Average OCR confidence
    const parsingConf = Math.min(100, (lineItems.length / Math.max(1, documents.length)) * 20);
    const detectionConf = detections.length === 0 ? 95 : Math.max(50, 100 - detections.length * 5);

    const overall = Math.round(ocrConf * 0.4 + parsingConf * 0.3 + detectionConf * 0.3);

    return {
      overall,
      sections: {
        ocr: ocrConf,
        parsing: parsingConf,
        detection: detectionConf
      }
    };
  }

  private generateComplianceFooters(): string[] {
    return [
      'This analysis provides general information and document automation, not legal or medical advice.',
      'Always verify information with your insurance company and healthcare providers.',
      'Wyng Lite is not insurance and does not guarantee payment outcomes.',
      'For complex legal matters, consult with a qualified healthcare attorney.',
      'This service respects patient privacy and does not store personal health information.',
      'Detection accuracy depends on document quality and completeness.',
      '📋 Professionally prepared by Wyng specialists at Quot Health Inc.'
    ];
  }
}