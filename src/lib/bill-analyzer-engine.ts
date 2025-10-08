import {
  DocumentArtifact,
  DocumentMeta,
  LineItem,
  Detection,
  PricedSummary,
  Guidance,
  NextAction,
  AnalyzerResult,
  ScriptTemplate,
  AppealLetter
} from '@/types/analyzer';
import { MoneyCents } from '@/types/common';
import { EnhancedOCRPipeline, ExtractedData } from './enhanced-ocr-pipeline';
import { NoBenefitsDetectionEngine, DetectionContext } from './no-benefits-detection-engine';

export interface BillAnalyzerInput {
  files: Array<{
    buffer: Buffer;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  userDescription?: string;
  userEmail?: string;
}

export class BillAnalyzerEngine {
  private ocrPipeline: EnhancedOCRPipeline;
  private detectionEngine: NoBenefitsDetectionEngine;

  constructor() {
    this.ocrPipeline = new EnhancedOCRPipeline();
    this.detectionEngine = new NoBenefitsDetectionEngine();
  }

  public async analyzeBills(input: BillAnalyzerInput): Promise<AnalyzerResult> {
    console.log('🔄 Starting bill analysis process...');

    try {
      // Step 1: Create document artifacts
      const artifacts = await this.createDocumentArtifacts(input.files);
      console.log(`📄 Created ${artifacts.length} document artifacts`);

      // Step 2: OCR and extract data from all documents
      const { documentMetas, lineItems } = await this.processAllDocuments(artifacts, input.files);
      console.log(`📋 Extracted ${lineItems.length} line items from ${documentMetas.length} documents`);

      // Step 3: Normalize and validate data
      const { normalizedDocs, normalizedItems } = this.normalizeAndValidate(documentMetas, lineItems);

      // Step 4: Run detection engine
      const detectionContext: DetectionContext = {
        documents: normalizedDocs,
        lineItems: normalizedItems,
        userNarrative: input.userDescription
      };

      const detections = this.detectionEngine.runAllDetections(detectionContext);
      console.log(`🔍 Found ${detections.length} potential issues`);

      // Step 5: Generate priced summary
      const pricedSummary = this.generatePricedSummary(normalizedDocs, normalizedItems);
      console.log('📊 Generated priced summary table');

      // Step 6: Generate guidance and scripts
      const guidance = this.generateGuidance(detections, normalizedDocs);
      const nextActions = this.generateNextActions(detections, normalizedDocs);
      console.log('📋 Generated guidance and action items');

      // Step 7: Calculate confidence
      const confidence = this.calculateConfidence(normalizedDocs, normalizedItems, detections);

      // Step 8: Build final result
      const result: AnalyzerResult = {
        documentMeta: normalizedDocs,
        lineItems: normalizedItems,
        pricedSummary,
        detections,
        confidence,
        complianceFooters: this.generateComplianceFooters()
      };

      console.log(`✅ Bill analysis complete: ${detections.length} detections, confidence ${confidence.overall}%`);
      return result;

    } finally {
      // Cleanup OCR resources
      await this.ocrPipeline.cleanup();
    }
  }

  private async createDocumentArtifacts(files: BillAnalyzerInput['files']): Promise<DocumentArtifact[]> {
    const artifacts: DocumentArtifact[] = [];

    for (const file of files) {
      const artifact: DocumentArtifact = {
        artifactId: this.generateArtifactId(),
        filename: file.filename,
        mime: file.mimeType,
        docType: this.classifyDocumentType(file.buffer, file.mimeType, file.filename),
        pages: await this.estimatePageCount(file.buffer, file.mimeType)
      };

      artifacts.push(artifact);
    }

    return artifacts;
  }

  private async processAllDocuments(
    artifacts: DocumentArtifact[],
    files: BillAnalyzerInput['files']
  ): Promise<{ documentMetas: DocumentMeta[], lineItems: LineItem[] }> {
    const documentMetas: DocumentMeta[] = [];
    const lineItems: LineItem[] = [];

    for (let i = 0; i < artifacts.length; i++) {
      const artifact = artifacts[i];
      const file = files[i];

      try {
        console.log(`📄 Processing ${artifact.filename}...`);

        // Extract data using OCR pipeline
        const extractedData = await this.ocrPipeline.processDocument(
          file.buffer,
          file.mimeType,
          artifact
        );

        // Convert to document meta
        const docMeta = this.convertToDocumentMeta(extractedData, artifact);
        documentMetas.push(docMeta);

        // Convert and add line items
        const convertedLineItems = this.convertToLineItems(extractedData, artifact);
        lineItems.push(...convertedLineItems);

        console.log(`✅ Processed ${artifact.filename}: ${convertedLineItems.length} line items`);

      } catch (error) {
        console.error(`❌ Failed to process ${artifact.filename}:`, error);
        // Continue with other documents
      }
    }

    return { documentMetas, lineItems };
  }

  private convertToDocumentMeta(extractedData: ExtractedData, artifact: DocumentArtifact): DocumentMeta {
    return {
      artifactId: artifact.artifactId,
      docType: artifact.docType,
      payer: extractedData.payer,
      providerName: extractedData.providerName,
      providerNPI: extractedData.providerNPI,
      providerTIN: extractedData.providerTIN,
      claimId: extractedData.claimId,
      accountId: extractedData.accountId,
      serviceDates: extractedData.serviceDates,
      totals: extractedData.totals,
    };
  }

  private convertToLineItems(extractedData: ExtractedData, artifact: DocumentArtifact): LineItem[] {
    return extractedData.lineItems.map((item, index) => ({
      lineId: `${artifact.artifactId}_line_${index + 1}`,
      artifactId: artifact.artifactId,
      description: item.description,
      code: item.code,
      modifiers: item.modifiers,
      units: item.units,
      pos: item.pos,
      npi: item.npi,
      charge: item.charge,
      allowed: item.allowed,
      planPaid: item.planPaid,
      patientResp: item.patientResp,
      dos: item.dos
    }));
  }

  private normalizeAndValidate(
    documentMetas: DocumentMeta[],
    lineItems: LineItem[]
  ): { normalizedDocs: DocumentMeta[], normalizedItems: LineItem[] } {
    console.log('🔗 Normalizing and validating extracted data...');

    // Normalize money values (already in cents from OCR)
    const normalizedItems = lineItems.map(item => ({
      ...item,
      // Ensure dates are in ISO format
      dos: item.dos ? this.normalizeDate(item.dos) : undefined
    }));

    // Validate and clean up document metadata
    const normalizedDocs = documentMetas.map(doc => ({
      ...doc,
      serviceDates: doc.serviceDates ? {
        start: this.normalizeDate(doc.serviceDates.start),
        end: doc.serviceDates.end ? this.normalizeDate(doc.serviceDates.end) : undefined
      } : undefined
    }));

    return { normalizedDocs, normalizedItems };
  }

  private generatePricedSummary(documents: DocumentMeta[], lineItems: LineItem[]): PricedSummary {
    // Get primary document for header info
    const primaryDoc = documents.find(doc => doc.docType === 'EOB') || documents[0];

    // Calculate totals
    const totals = {
      billed: lineItems.reduce((sum, item) => sum + (item.charge || 0), 0),
      allowed: lineItems.reduce((sum, item) => sum + (item.allowed || 0), 0),
      planPaid: lineItems.reduce((sum, item) => sum + (item.planPaid || 0), 0),
      patientResp: lineItems.reduce((sum, item) => sum + (item.patientResp || 0), 0)
    };

    // If no calculated totals, use document totals
    if (totals.billed === 0 && primaryDoc?.totals?.billed) {
      Object.assign(totals, primaryDoc.totals);
    }

    return {
      header: {
        providerName: primaryDoc?.providerName,
        NPI: primaryDoc?.providerNPI,
        claimId: primaryDoc?.claimId,
        accountId: primaryDoc?.accountId,
        serviceDates: primaryDoc?.serviceDates,
        payer: primaryDoc?.payer,
      },
      totals,
      lines: lineItems.map(item => ({
        lineId: item.lineId,
        code: item.code,
        modifiers: item.modifiers,
        description: item.description,
        units: item.units,
        dos: item.dos,
        pos: item.pos,
        npi: item.npi,
        charge: item.charge,
        allowed: item.allowed,
        planPaid: item.planPaid,
        patientResp: item.patientResp
      })),
      notes: this.generateSummaryNotes(documents, lineItems)
    };
  }

  private generateGuidance(detections: Detection[], documents: DocumentMeta[]): Guidance {
    const phoneScripts: ScriptTemplate[] = [];
    const appealLetters: AppealLetter[] = [];

    // Generate phone scripts for each detection category
    const detectionGroups = this.groupDetectionsByCategory(detections);

    for (const [category, categoryDetections] of Array.from(detectionGroups.entries())) {
      const script = this.generatePhoneScript(category, categoryDetections, documents);
      if (script) phoneScripts.push(script);

      const letter = this.generateAppealLetter(category, categoryDetections, documents);
      if (letter) appealLetters.push(letter);
    }

    // Add general inquiry script
    phoneScripts.unshift({
      title: 'General Billing Inquiry',
      body: this.getGeneralInquiryScript(documents)
    });

    return { phoneScripts, appealLetters };
  }

  private generateNextActions(detections: Detection[], documents: DocumentMeta[]): NextAction[] {
    const actions: NextAction[] = [];

    // High priority detections first
    const highPriorityDetections = detections.filter(d => d.severity === 'high');
    if (highPriorityDetections.length > 0) {
      actions.push({
        label: `Address ${highPriorityDetections.length} high-priority billing issues`,
        dueDateISO: this.getDatePlusDays(7) // 1 week
      });
    }


    // Request itemized bills if needed
    const hasHighChargesLowDetail = documents.some(doc =>
      doc.totals?.billed && doc.totals.billed > 100000 && // $1000+
      detections.some(d => d.category === 'MissingItemized')
    );

    if (hasHighChargesLowDetail) {
      actions.push({
        label: 'Request detailed itemized statements',
        dueDateISO: this.getDatePlusDays(14) // 2 weeks
      });
    }

    // Follow up on detections
    if (detections.length > 0) {
      actions.push({
        label: 'Follow up on billing inquiry responses',
        dueDateISO: this.getDatePlusDays(21) // 3 weeks
      });
    }

    return actions;
  }

  private calculateConfidence(
    documents: DocumentMeta[],
    lineItems: LineItem[],
    detections: Detection[]
  ): { overall: number; sections?: { [k: string]: number } } {
    // OCR confidence based on line items with confidence scores
    const ocrConfidences = lineItems
      .map(item => item.ocr?.conf || 0.8)
      .filter(conf => conf > 0);
    const avgOcrConf = ocrConfidences.length > 0
      ? ocrConfidences.reduce((sum, conf) => sum + conf, 0) / ocrConfidences.length
      : 0.8;

    // Parsing confidence based on data completeness
    const hasEssentialData = documents.some(doc =>
      doc.providerName && (doc.claimId || doc.accountId)
    );
    const hasLineItemData = lineItems.length > 0 && lineItems.some(item =>
      item.code && item.charge
    );
    const parsingConf = (hasEssentialData ? 0.5 : 0) + (hasLineItemData ? 0.5 : 0);

    // Detection confidence based on number and severity of issues
    const highSeverityCount = detections.filter(d => d.severity === 'high').length;
    const detectionConf = Math.max(0.3, 1.0 - (highSeverityCount * 0.1));

    const overall = Math.round((avgOcrConf * 0.4 + parsingConf * 0.3 + detectionConf * 0.3) * 100);

    return {
      overall: Math.max(50, Math.min(98, overall)),
      sections: {
        ocr: Math.round(avgOcrConf * 100),
        parsing: Math.round(parsingConf * 100),
        detection: Math.round(detectionConf * 100)
      }
    };
  }

  // Helper methods
  private classifyDocumentType(buffer: Buffer, mimeType: string, filename: string): DocumentArtifact['docType'] {
    const text = buffer.toString('utf8', 0, Math.min(2048, buffer.length)).toLowerCase();
    const filenameLC = filename.toLowerCase();

    // EOB indicators
    if (text.includes('explanation of benefits') ||
        text.includes('eob') ||
        filenameLC.includes('eob') ||
        text.includes('allowed amount') ||
        text.includes('plan paid')) {
      return 'EOB';
    }

    // Bill indicators
    if (text.includes('itemized') ||
        text.includes('statement') ||
        text.includes('balance due') ||
        filenameLC.includes('bill') ||
        filenameLC.includes('statement')) {
      return 'BILL';
    }

    // Letter indicators
    if (text.includes('dear ') ||
        text.includes('sincerely') ||
        filenameLC.includes('letter') ||
        text.includes('appeal') ||
        text.includes('denial')) {
      return 'LETTER';
    }

    // Portal screenshot indicators
    if (filenameLC.includes('screenshot') ||
        filenameLC.includes('portal') ||
        text.includes('member portal') ||
        text.includes('patient portal')) {
      return 'PORTAL';
    }

    return 'UNKNOWN';
  }

  private async estimatePageCount(buffer: Buffer, mimeType: string): Promise<number> {
    if (mimeType === 'application/pdf') {
      const bufferStr = buffer.toString('latin1');
      const pageMatches = bufferStr.match(/\/Type\s*\/Page[^s]/g);
      if (pageMatches && pageMatches.length > 0) {
        return Math.max(1, pageMatches.length);
      }
      // Fallback to size estimation
      return Math.max(1, Math.floor(buffer.length / 50000));
    }
    return 1; // Images are single page
  }

  private extractNarrativeTags(description: string): string[] {
    const tags: string[] = [];
    const text = description.toLowerCase();

    if (/emergency|er |urgent/.test(text)) tags.push('ER');
    if (/anesthesia|anesthetist/.test(text)) tags.push('anesthesia');
    if (/surprise.*bill|unexpected.*bill/.test(text)) tags.push('surpriseBill');
    if (/out.*network|oon/.test(text)) tags.push('outOfNetwork');
    if (/facility.*fee/.test(text)) tags.push('facilityFee');
    if (/preventive|screening|annual/.test(text)) tags.push('preventive');

    return tags;
  }

  private inferCaseContext(artifacts: DocumentArtifact[], description: string): any {
    const inferred: any = {};
    const tags = this.extractNarrativeTags(description);

    if (tags.includes('ER')) {
      inferred.facilityType = 'ER';
      inferred.emergency = true;
    }

    if (tags.includes('surpriseBill') || tags.includes('outOfNetwork')) {
      inferred.nsaCandidate = true;
    }

    if (tags.includes('anesthesia')) {
      inferred.ancillaryVendors = ['anesthesia'];
    }

    return inferred;
  }

  private normalizeDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  }

  private generateSummaryNotes(documents: DocumentMeta[], lineItems: LineItem[]): string[] {
    const notes: string[] = [];

    const docTypes = Array.from(new Set(documents.map(doc => doc.docType)));
    notes.push(`Analyzed ${documents.length} document(s): ${docTypes.join(', ')}`);

    const totalCharges = lineItems.reduce((sum, item) => sum + (item.charge || 0), 0);
    if (totalCharges > 0) {
      notes.push(`Total charges: $${(totalCharges / 100).toFixed(2)}`);
    }

    const uniqueProviders = Array.from(new Set(lineItems.map(item => item.npi).filter(Boolean)));
    if (uniqueProviders.length > 1) {
      notes.push(`Multiple providers detected (${uniqueProviders.length})`);
    }

    return notes;
  }

  private groupDetectionsByCategory(detections: Detection[]): Map<string, Detection[]> {
    const groups = new Map<string, Detection[]>();

    for (const detection of detections) {
      if (!groups.has(detection.category)) {
        groups.set(detection.category, []);
      }
      groups.get(detection.category)!.push(detection);
    }

    return groups;
  }

  private generatePhoneScript(
    category: string,
    detections: Detection[],
    documents: DocumentMeta[]
  ): ScriptTemplate | null {
    const primaryDoc = documents[0];
    const questions = detections.flatMap(d => d.suggestedQuestions || []);

    if (questions.length === 0) return null;

    const scriptBody = `
Hi, I'm calling about my account ${primaryDoc?.accountId || 'ACCOUNT_ID'} regarding billing questions.

${questions.slice(0, 3).map(q => `• ${q}`).join('\n')}

Can you help me understand these charges and provide documentation for any fees?

Thank you for your time.
`.trim();

    return {
      title: `${this.getCategoryDisplayName(category)} Inquiry`,
      body: scriptBody
    };
  }

  private generateAppealLetter(
    category: string,
    detections: Detection[],
    documents: DocumentMeta[]
  ): AppealLetter | null {
    const highSeverityDetections = detections.filter(d => d.severity === 'high');
    if (highSeverityDetections.length === 0) return null;

    const primaryDoc = documents[0];
    const detection = highSeverityDetections[0];

    const letterBody = `
[Date]

[Provider/Insurance Name]
[Address]

RE: Account #${primaryDoc?.accountId || 'ACCOUNT_ID'}
Claim #${primaryDoc?.claimId || 'CLAIM_ID'}

Dear Billing Department,

I am writing to formally dispute charges on the above account. After reviewing my statement, I have identified the following concern:

${detection.explanation}

${detection.evidence?.snippets?.join('\n') || ''}

I am requesting:
1. A detailed review of these charges
2. Corrected billing if errors are found
3. Supporting documentation for all fees

Please review this matter and respond within 30 days with your findings.

Sincerely,

[Your Name]
[Your Address]
[Your Phone]
    `.trim();

    return {
      title: `${this.getCategoryDisplayName(category)} Appeal`,
      body: letterBody,
      attachments: ['Original bill copy', 'EOB copy (if available)']
    };
  }

  private getGeneralInquiryScript(documents: DocumentMeta[]): string {
    const primaryDoc = documents[0];

    return `
Hi, I'm calling about my account ${primaryDoc?.accountId || 'ACCOUNT_ID'} and have questions about my recent bill.

Can you help me understand:
• The specific services provided and their charges
• Whether my insurance was billed correctly
• If there are any errors or adjustments needed

I have my account information ready. Thank you for your help.
    `.trim();
  }

  private getCategoryDisplayName(category: string): string {
    const displayNames: { [key: string]: string } = {
      'Duplicate': 'Duplicate Charges',
      'Unbundling': 'Unbundling Issues',
      'Modifier': 'Modifier Problems',
      'ProfTechSplit': 'Professional/Technical Split',
      'FacilityFee': 'Facility Fee',
      'NSA_Ancillary': 'Surprise Billing (Ancillary)',
      'NSA_ER': 'Surprise Billing (Emergency)',
      'Preventive': 'Preventive Care',
      'GlobalSurgery': 'Global Surgery',
      'DrugUnits': 'Drug Units',
      'TherapyUnits': 'Therapy Units',
      'TimelyFiling': 'Timely Filing',
      'COB': 'Coordination of Benefits',
      'EOBZeroStillBilled': 'EOB vs Bill Mismatch',
      'MathError': 'Calculation Error',
      'ObsVsInpatient': 'Observation Status',
      'NonProviderFee': 'Administrative Fees',
      'MissingItemized': 'Missing Detail'
    };

    return displayNames[category] || category;
  }

  private getDatePlusDays(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  private generateCaseId(): string {
    return `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateArtifactId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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