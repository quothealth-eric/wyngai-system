import { AnalyzerResult, DocumentMeta, BenefitsContext, Detection, NextAction } from '@/types/analyzer';
import { DocumentParser, EnhancedOCRResult } from './enhanced-ocr-parser';
import { DetectionEngine } from './detection-engine';
import { BenefitsAwareEngine } from './benefits-aware-engine';
import { GuidanceGenerator } from './guidance-generator';
import { EmailGate } from './email-gate';
import { performOCR } from './ocr';

export interface AnalysisInput {
  files: Array<{ buffer: Buffer; filename: string; mimeType: string }>;
  benefits?: BenefitsContext;
  userEmail?: string;
  userDescription?: string;
  clientIP?: string;
}

export class ComprehensiveAnalyzer {
  private detectionEngine: DetectionEngine;
  private benefitsEngine: BenefitsAwareEngine;
  private guidanceGenerator: GuidanceGenerator;

  constructor() {
    this.detectionEngine = new DetectionEngine();
    this.benefitsEngine = new BenefitsAwareEngine();
    this.guidanceGenerator = new GuidanceGenerator();
  }

  public async analyzeDocuments(input: AnalysisInput): Promise<AnalyzerResult> {
    try {
      // Step 1: Rate limiting check
      if (input.clientIP) {
        const ipAllowed = await EmailGate.checkIPRateLimit(input.clientIP);
        if (!ipAllowed) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
      }

      // Step 2: OCR and parsing
      console.log('🔍 Starting OCR and document parsing...');
      const parsedDocuments = await this.processDocuments(input.files);

      // Step 3: Merge documents (for multiple pages/files)
      const mergedStructure = this.mergeDocumentStructures(parsedDocuments);
      const primaryDoc = parsedDocuments[0]; // Use first document for metadata

      // Step 4: Run static detections (no benefits required)
      console.log('🔎 Running static detection rules...');
      const staticDetections = this.detectionEngine.runDetections(mergedStructure);

      // Step 5: Run benefits-aware detections if benefits provided
      let benefitsDetections: Detection[] = [];
      if (input.benefits) {
        console.log('💰 Running benefits-aware detection rules...');
        benefitsDetections = this.benefitsEngine.runBenefitsDetections(mergedStructure, input.benefits);
      }

      // Step 6: Combine all detections
      const allDetections = [...staticDetections, ...benefitsDetections];

      // Step 7: Generate guidance and next actions
      console.log('📋 Generating guidance and action items...');
      const guidance = this.guidanceGenerator.generateGuidance(allDetections, primaryDoc.documentMeta, input.benefits);
      const nextActions = this.guidanceGenerator.generateNextActions(allDetections, primaryDoc.documentMeta);

      // Step 8: Email gating check
      let emailGateResult = { emailOk: true };
      if (input.userEmail) {
        emailGateResult = await EmailGate.checkEmailAccess(input.userEmail);
        if (emailGateResult.emailOk) {
          await EmailGate.recordUsage(input.userEmail);
        }
      }

      // Step 9: Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(parsedDocuments, allDetections);

      // Step 10: Build result
      const result: AnalyzerResult = {
        documentMeta: primaryDoc.documentMeta,
        lineItems: mergedStructure.lineItems,
        detections: allDetections,
        guidance,
        nextActions,
        confidence: {
          overall: overallConfidence,
          sections: {
            ocr: this.calculateAverageOCRConfidence(parsedDocuments),
            parsing: this.calculateParsingConfidence(mergedStructure),
            detection: this.calculateDetectionConfidence(allDetections)
          }
        },
        complianceFooters: this.generateComplianceFooters(),
        emailGate: emailGateResult,
        benefitsContext: input.benefits
      };

      console.log('✅ Analysis complete:', {
        detectionsFound: allDetections.length,
        confidenceScore: overallConfidence,
        emailGateStatus: emailGateResult.emailOk ? 'allowed' : 'blocked'
      });

      return result;

    } catch (error) {
      console.error('❌ Analysis failed:', error);
      throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processDocuments(files: Array<{ buffer: Buffer; filename: string; mimeType: string }>): Promise<EnhancedOCRResult[]> {
    const results: EnhancedOCRResult[] = [];

    for (const file of files) {
      try {
        console.log(`🔍 Processing ${file.filename} (${file.mimeType})`);

        // Perform OCR
        const ocrResult = await performOCR(file.buffer, file.mimeType);

        // Parse document structure
        const parser = new DocumentParser(ocrResult.text, file.filename, 1);
        const enhancedResult = parser.parse();

        results.push(enhancedResult);

      } catch (error) {
        console.error(`Failed to process ${file.filename}:`, error);
        // Continue with other files
      }
    }

    if (results.length === 0) {
      throw new Error('Failed to process any documents');
    }

    return results;
  }

  private mergeDocumentStructures(documents: EnhancedOCRResult[]) {
    // For now, just use the first document's structure
    // In a more sophisticated implementation, we'd merge multiple documents intelligently
    return documents[0].structure;
  }

  private calculateOverallConfidence(documents: EnhancedOCRResult[], detections: Detection[]): number {
    const ocrConf = this.calculateAverageOCRConfidence(documents);
    const parsingConf = this.calculateParsingConfidence(documents[0].structure);
    const detectionConf = this.calculateDetectionConfidence(detections);

    // Weighted average: OCR 40%, Parsing 30%, Detection 30%
    return Math.round(ocrConf * 0.4 + parsingConf * 0.3 + detectionConf * 0.3);
  }

  private calculateAverageOCRConfidence(documents: EnhancedOCRResult[]): number {
    if (documents.length === 0) return 0;
    const total = documents.reduce((sum, doc) => sum + doc.confidence, 0);
    return total / documents.length;
  }

  private calculateParsingConfidence(structure: any): number {
    let score = 0;
    let maxScore = 0;

    // Header completeness (30 points)
    maxScore += 30;
    const headerFields = ['claimId', 'accountId', 'providerName', 'serviceDate'];
    const headerScore = headerFields.filter(field => structure.header[field]).length;
    score += (headerScore / headerFields.length) * 30;

    // Totals extraction (35 points)
    maxScore += 35;
    const totalFields = Object.keys(structure.totals);
    score += Math.min(totalFields.length / 4, 1) * 35;

    // Line items (35 points)
    maxScore += 35;
    const lineItemScore = Math.min(structure.lineItems.length / 3, 1) * 35;
    score += lineItemScore;

    return Math.round((score / maxScore) * 100);
  }

  private calculateDetectionConfidence(detections: Detection[]): number {
    if (detections.length === 0) return 95; // High confidence when no issues found

    // Lower confidence with more high-severity detections
    const highSeverityCount = detections.filter(d => d.severity === 'high').length;
    const mediumSeverityCount = detections.filter(d => d.severity === 'warn').length;

    let confidence = 100;
    confidence -= highSeverityCount * 10;
    confidence -= mediumSeverityCount * 5;

    return Math.max(50, confidence); // Minimum 50% confidence
  }

  private generateComplianceFooters(): string[] {
    return [
      'This analysis provides general information and document automation, not legal or medical advice.',
      'Always verify information with your insurance company and healthcare providers.',
      'Wyng Lite is not insurance and does not guarantee payment outcomes.',
      'For complex legal matters, consult with a qualified healthcare attorney.',
      'This service respects patient privacy and does not store personal health information.',
      'Detection accuracy depends on document quality and completeness.'
    ];
  }
}

// Utility functions for the analyzer
export function stripPHI(text: string): string {
  // Remove common PHI patterns
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN-REDACTED]') // SSN
    .replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE-REDACTED]') // Phone numbers
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL-REDACTED]') // Email
    .replace(/\b\d{16}\b/g, '[CARD-REDACTED]'); // Credit card numbers
}

export function validateDocumentBeforeProcessing(buffer: Buffer, mimeType: string): { valid: boolean; error?: string } {
  // Check file size (max 15MB = 15,728,640 bytes)
  const maxSize = 15 * 1024 * 1024;
  const sizeMB = buffer.length / 1024 / 1024;

  console.log(`🔍 validateDocumentBeforeProcessing: buffer ${buffer.length} bytes (${sizeMB.toFixed(2)}MB) vs ${maxSize} bytes limit`);

  if (buffer.length > maxSize) {
    const errorMsg = `File size ${sizeMB.toFixed(2)}MB exceeds 15MB limit`;
    console.log(`❌ Validation failed: ${errorMsg}`);
    return { valid: false, error: errorMsg };
  }

  // Check supported mime types
  const supportedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ];

  if (!supportedTypes.includes(mimeType)) {
    return { valid: false, error: 'Unsupported file type. Please upload PDF, JPEG, PNG, or WebP files.' };
  }

  return { valid: true };
}