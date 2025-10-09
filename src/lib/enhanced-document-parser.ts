import { DocumentArtifact, DocumentMeta, LineItem } from '@/types/analyzer';
import { TableAwareExtractor } from './table-aware-extraction';
import { MoneyCents } from '@/types/common';

export interface ParsedDocument {
  documentMeta: DocumentMeta;
  lineItems: LineItem[];
  confidence: number;
}

export class EnhancedDocumentParser {
  private caseId: string = '';
  private caseStartTime: number = 0;
  private tableExtractor: TableAwareExtractor;

  constructor() {
    this.tableExtractor = new TableAwareExtractor();
  }

  public async parseDocument(artifact: DocumentArtifact): Promise<ParsedDocument> {
    console.log(`🔍 Enhanced parsing with table-aware extraction: ${artifact.filename} (${artifact.docType})`);

    // Initialize case-specific context for this parsing session
    if (!this.caseId || !this.caseStartTime) {
      this.initializeCaseContext(artifact);
    }

    console.log(`📋 Parsing document for case ${this.caseId} - ${artifact.filename} with validated CPT extraction`);

    // Create mock OCR data for now (in production this would be real OCR results)
    const mockOCRResult = this.createMockOCRData(artifact);

    // Use table-aware extraction for validated line items
    const lineItems = this.tableExtractor.extractLineItems(
      artifact.artifactId,
      this.caseId,
      mockOCRResult,
      artifact.docType
    );

    const documentMeta = await this.extractDocumentMeta(artifact);
    const confidence = this.calculateParsingConfidence(documentMeta, lineItems);

    console.log(`✅ Table-aware extraction completed: ${lineItems.length} validated line items extracted`);

    return {
      documentMeta,
      lineItems,
      confidence
    };
  }

  private initializeCaseContext(artifact: DocumentArtifact): void {
    // Create a unique case context based on artifact ID and timestamp
    this.caseId = artifact.artifactId.split('_')[0] || `case_${Date.now()}`;
    this.caseStartTime = Date.now();
    console.log(`🆔 Initialized new case context: ${this.caseId} at ${this.caseStartTime}`);
  }

  // Reset case context for new analysis sessions
  public resetCaseContext(): void {
    this.caseId = '';
    this.caseStartTime = 0;
    console.log('🔄 Reset case context for new analysis session');
  }

  private createMockOCRData(artifact: DocumentArtifact): any {
    // Create mock OCR data that demonstrates the table-aware extraction fixes
    if (artifact.docType === 'BILL') {
      // Hospital bill scenario - should extract lab codes, NOT 99213 from patient ID
      return {
        tokens: [
          { text: 'Description', bbox: [100, 50, 80, 20], conf: 0.95, page: 1 },
          { text: 'Charges', bbox: [300, 50, 60, 20], conf: 0.95, page: 1 },

          // Valid lab codes with amounts
          { text: '85025', bbox: [100, 100, 50, 15], conf: 0.92, page: 1 },
          { text: 'CBC AUTO DIFF', bbox: [160, 100, 120, 15], conf: 0.90, page: 1 },
          { text: '$45.00', bbox: [300, 100, 50, 15], conf: 0.93, page: 1 },

          { text: '80053', bbox: [100, 120, 50, 15], conf: 0.91, page: 1 },
          { text: 'COMPREHENSIVE METABOLIC PANEL', bbox: [160, 120, 180, 15], conf: 0.88, page: 1 },
          { text: '$78.50', bbox: [300, 120, 50, 15], conf: 0.92, page: 1 },

          // J-code (should be extracted)
          { text: 'J1200', bbox: [100, 180, 50, 15], conf: 0.93, page: 1 },
          { text: 'DIPHENHYDRAMINE INJECTION', bbox: [160, 180, 150, 15], conf: 0.87, page: 1 },
          { text: '$28.90', bbox: [300, 180, 50, 15], conf: 0.94, page: 1 },

          // 99213 as patient ID (should be REJECTED)
          { text: '99213', bbox: [500, 300, 50, 15], conf: 0.80, page: 1 },
          { text: 'Patient ID Number', bbox: [560, 300, 140, 15], conf: 0.75, page: 1 }
          // No amount - should be rejected by validation
        ],
        kvs: [],
        tables: [{
          page: 1,
          rows: [
            [
              { text: 'Description', bbox: [100, 50, 80, 20], conf: 0.95, page: 1 },
              { text: 'Charges', bbox: [300, 50, 60, 20], conf: 0.95, page: 1 }
            ],
            [
              { text: '85025 CBC AUTO DIFF', bbox: [100, 100, 180, 15], conf: 0.91, page: 1 },
              { text: '$45.00', bbox: [300, 100, 50, 15], conf: 0.93, page: 1 }
            ]
          ]
        }],
        metadata: { engine: 'mock', pages: 1, docTypeHint: 'bill' }
      };
    } else if (artifact.docType === 'EOB') {
      // EOB scenario - should extract 99213 when it has valid amounts
      return {
        tokens: [
          { text: 'Service', bbox: [50, 30, 60, 20], conf: 0.95, page: 1 },
          { text: 'Billed', bbox: [200, 30, 50, 20], conf: 0.95, page: 1 },

          { text: '99213', bbox: [50, 60, 50, 15], conf: 0.92, page: 1 },
          { text: 'OFFICE VISIT', bbox: [110, 60, 80, 15], conf: 0.90, page: 1 },
          { text: '$17.63', bbox: [200, 60, 50, 15], conf: 0.93, page: 1 }
        ],
        kvs: [],
        tables: [{
          page: 1,
          rows: [
            [
              { text: 'Service', bbox: [50, 30, 60, 20], conf: 0.95, page: 1 },
              { text: 'Billed', bbox: [200, 30, 50, 20], conf: 0.95, page: 1 }
            ],
            [
              { text: '99213 OFFICE VISIT', bbox: [50, 60, 140, 15], conf: 0.91, page: 1 },
              { text: '$17.63', bbox: [200, 60, 50, 15], conf: 0.93, page: 1 }
            ]
          ]
        }],
        metadata: { engine: 'mock', pages: 1, docTypeHint: 'eob' }
      };
    }

    // Default empty OCR result
    return {
      tokens: [],
      kvs: [],
      tables: [],
      metadata: { engine: 'mock', pages: 1, docTypeHint: 'unknown' }
    };
  }

  private async extractDocumentMeta(artifact: DocumentArtifact): Promise<DocumentMeta> {
    // Mock extraction - in production would use OCR to extract:
    // - Header fields: patient info, subscriber ID, claim numbers
    // - Provider details: name, NPI, TIN
    // - Appeal information: address, deadlines
    // - Document totals: billed, allowed, plan paid, patient responsibility

    const meta: DocumentMeta = {
      artifactId: artifact.artifactId,
      docType: artifact.docType,
    };

    // Enhanced extraction based on document type
    if (artifact.docType === 'EOB') {
      meta.payer = this.mockExtractPayer(artifact.filename);
      meta.providerName = this.mockExtractProvider(artifact.filename);
      meta.providerNPI = this.generateMockNPI();
      meta.providerTIN = this.generateMockTIN();
      meta.claimId = this.generateMockClaimId();
      meta.serviceDates = {
        start: this.generateMockServiceDate(),
        end: this.generateMockServiceDate()
      };
      meta.totals = {
        billed: this.generateMockAmount(5000, 50000, 'billed'),
        allowed: this.generateMockAmount(3000, 40000, 'allowed'),
        planPaid: this.generateMockAmount(2000, 30000, 'planPaid'),
        patientResp: this.generateMockAmount(500, 5000, 'patientResp')
      };
      // Appeal info would be stored elsewhere since DocumentMeta doesn't include appeal property
    } else if (artifact.docType === 'BILL') {
      meta.providerName = this.mockExtractProvider(artifact.filename);
      meta.providerNPI = this.generateMockNPI();
      meta.accountId = this.generateMockAccountId();
      meta.serviceDates = {
        start: this.generateMockServiceDate()
      };
      meta.totals = {
        billed: this.generateMockAmount(5000, 50000, 'bill_billed'),
        patientResp: this.generateMockAmount(1000, 10000, 'bill_patientResp')
      };
    }

    return meta;
  }

  private async extractLineItems(artifact: DocumentArtifact): Promise<LineItem[]> {
    // Mock line item extraction - in production would use OCR to extract:
    // - Procedure codes (CPT/HCPCS)
    // - Modifiers and revenue codes
    // - Units, charges, adjustments
    // - Place of service, provider NPIs
    // - Date of service for each line

    // Scale line items based on document pages (more pages = more line items)
    const baseItems = Math.floor(Math.random() * 8) + 3; // 3-10 base line items
    const pageMultiplier = Math.max(1, artifact.pages * 0.7); // Scale with pages
    const itemCount = Math.floor(baseItems * pageMultiplier);

    console.log(`📋 Generating ${itemCount} line items for ${artifact.pages}-page document: ${artifact.filename}`);
    const lineItems: LineItem[] = [];

    for (let i = 0; i < itemCount; i++) {
      const lineId = `line_${artifact.artifactId}_${i + 1}`;
      const code = this.generateMockCPTCode();
      const charge = this.generateMockAmount(100, 5000, `line_${i}_charge`);

      const lineItem: LineItem = {
        lineId,
        artifactId: artifact.artifactId,
        description: this.getMockDescription(code.value),
        code: code.value,
        units: Math.floor(Math.random() * 3) + 1,
        charge,
        dos: this.generateMockServiceDate(),
        pos: this.generateMockPOS(),
        npi: this.generateMockNPI(),
        ocr: {
          page: Math.floor(i / Math.ceil(itemCount / artifact.pages)) + 1, // Distribute items across pages
          bbox: [
            Math.floor(Math.random() * 200) + 50,  // x
            Math.floor(Math.random() * 600) + 100, // y
            Math.floor(Math.random() * 200) + 300, // width
            Math.floor(Math.random() * 20) + 15    // height
          ],
          conf: Math.random() * 0.3 + 0.7 // 70-100% confidence
        }
      };

      // Add EOB-specific fields
      if (artifact.docType === 'EOB') {
        lineItem.allowed = Math.floor(charge * (0.6 + Math.random() * 0.3)); // 60-90% of charge
        lineItem.planPaid = Math.floor((lineItem.allowed || charge) * (0.5 + Math.random() * 0.4)); // 50-90% of allowed
        lineItem.patientResp = (lineItem.allowed || charge) - (lineItem.planPaid || 0);
      }

      // Occasionally add modifiers
      if (Math.random() < 0.3) {
        lineItem.modifiers = [this.generateMockModifier()];
      }

      // Occasionally add revenue code
      if (Math.random() < 0.4) {
        lineItem.revCode = this.generateMockRevenueCode();
      }

      lineItems.push(lineItem);
    }

    return lineItems;
  }

  private calculateParsingConfidence(meta: DocumentMeta, lineItems: LineItem[]): number {
    // Calculate confidence based on extracted fields and OCR quality
    let confidence = 85; // Base confidence

    // Boost for complete header extraction
    if (meta.providerName && meta.claimId && meta.serviceDates) confidence += 5;
    if (meta.totals?.billed && meta.totals?.patientResp) confidence += 5;
    // Appeal property removed since not in DocumentMeta interface

    // Boost for line item completeness
    const avgLineConfidence = lineItems.reduce((sum, item) => sum + (item.ocr?.conf || 0.8), 0) / lineItems.length;
    confidence = Math.floor(confidence * avgLineConfidence);

    // Cap at reasonable range
    return Math.min(98, Math.max(65, confidence));
  }

  // Mock data generation helpers - now case-specific
  private mockExtractPayer(filename: string): string {
    const payers = ['Aetna', 'Blue Cross Blue Shield', 'Cigna', 'UnitedHealth', 'Humana', 'Kaiser Permanente'];
    // Use case ID to determine payer consistently for this case
    const hash = this.hashString(this.caseId + filename);
    return payers[hash % payers.length];
  }

  private mockExtractProvider(filename: string): string {
    const providers = ['City Medical Center', 'Regional Hospital', 'Family Health Clinic', 'Specialty Care Associates', 'Emergency Medical Group'];
    // Use case ID and filename to determine provider consistently for this case
    const hash = this.hashString(this.caseId + filename + 'provider');
    return providers[hash % providers.length];
  }

  private generateMockNPI(): string {
    // Generate case-specific NPI
    const hash = this.hashString(this.caseId + 'npi');
    return '1' + (hash.toString().padStart(9, '0')).slice(0, 9);
  }

  private generateMockTIN(): string {
    // Generate case-specific TIN
    const hash = this.hashString(this.caseId + 'tin');
    return (hash.toString().padStart(9, '0')).slice(0, 9);
  }

  private generateMockClaimId(): string {
    // Generate case-specific claim ID
    const hash = this.hashString(this.caseId + 'claim');
    return 'CLM' + hash.toString(36).toUpperCase().padEnd(12, '0').slice(0, 12);
  }

  private generateMockAccountId(): string {
    // Generate case-specific account ID
    const hash = this.hashString(this.caseId + 'account');
    return 'ACC' + hash.toString(36).toUpperCase().padEnd(10, '0').slice(0, 10);
  }

  private hashString(str: string): number {
    // Simple hash function to convert string to consistent number
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private generateMockServiceDate(): string {
    // Generate case-specific service date within last 90 days
    const hash = this.hashString(this.caseId + 'servicedate');
    const daysBack = hash % 90; // 0-89 days back
    const date = new Date();
    date.setDate(date.getDate() - daysBack);
    return date.toISOString().split('T')[0];
  }

  private generateAppealDeadline(): string {
    // Generate case-specific appeal deadline (6 months from now)
    const date = new Date();
    date.setDate(date.getDate() + 180);
    return date.toISOString();
  }

  private generateMockAmount(min: number, max: number, context: string = 'amount'): MoneyCents {
    // Generate case-specific amounts within range
    const hash = this.hashString(this.caseId + context + this.caseStartTime.toString());
    const range = max - min;
    return min + (hash % range);
  }

  private generateMockCPTCode(): { system: "CPT" | "HCPCS"; value: string } {
    const cptCodes = ['99213', '99214', '99215', '99223', '99232', '99233', '93000', '80053', '85025', '36415'];
    const hcpcsCodes = ['G0439', 'J1100', 'A4649', 'E0424', 'L3806'];

    // Use case-specific hash to determine code type and selection
    const hash = this.hashString(this.caseId + 'cptcode');
    const useCPT = (hash % 10) < 8; // 80% CPT, 20% HCPCS

    if (useCPT) {
      const codeIndex = hash % cptCodes.length;
      return { system: 'CPT', value: cptCodes[codeIndex] };
    } else {
      const codeIndex = hash % hcpcsCodes.length;
      return { system: 'HCPCS', value: hcpcsCodes[codeIndex] };
    }
  }

  private getMockDescription(code: string): string {
    const descriptions: { [key: string]: string } = {
      '99213': 'Office visit, established patient, low complexity',
      '99214': 'Office visit, established patient, moderate complexity',
      '99215': 'Office visit, established patient, high complexity',
      '99223': 'Initial hospital care, detailed',
      '99232': 'Subsequent hospital care, moderate',
      '99233': 'Subsequent hospital care, high complexity',
      '93000': 'Electrocardiogram, routine ECG',
      '80053': 'Comprehensive metabolic panel',
      '85025': 'Complete blood count with differential',
      '36415': 'Routine venipuncture',
      'G0439': 'Annual wellness visit, initial',
      'J1100': 'Injection, dexamethasone sodium phosphate',
      'A4649': 'Surgical supply; miscellaneous',
      'E0424': 'Stationary compressed gaseous oxygen system',
      'L3806': 'Wrist hand finger orthosis'
    };
    return descriptions[code] || 'Medical service or procedure';
  }

  private generateMockModifier(): string {
    const modifiers = ['25', '26', '59', 'RT', 'LT', 'TC', 'GT', 'GZ'];
    return modifiers[Math.floor(Math.random() * modifiers.length)];
  }

  private generateMockRevenueCode(): string {
    const revCodes = ['0250', '0260', '0270', '0300', '0450', '0636', '0730', '0920'];
    return revCodes[Math.floor(Math.random() * revCodes.length)];
  }

  private generateMockPOS(): string {
    const posCodes = ['11', '21', '22', '23', '24', '25', '26'];
    return posCodes[Math.floor(Math.random() * posCodes.length)];
  }
}