import { createWorker } from 'tesseract.js';
import { DocumentArtifact, OCRConfidence } from '@/types/analyzer';
import { MoneyCents } from '@/types/common';

export interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    bbox: [number, number, number, number];
    confidence: number;
  }>;
  layout?: {
    paragraphs: Array<{
      text: string;
      bbox: [number, number, number, number];
    }>;
    tables?: Array<{
      cells: Array<{
        text: string;
        bbox: [number, number, number, number];
        row: number;
        col: number;
      }>;
    }>;
  };
}

export interface ExtractedData {
  providerName?: string;
  providerNPI?: string;
  providerTIN?: string;
  claimId?: string;
  accountId?: string;
  payer?: string;
  serviceDates?: { start: string; end?: string };
  totals?: {
    billed?: MoneyCents;
    allowed?: MoneyCents;
    planPaid?: MoneyCents;
    patientResponsibility?: MoneyCents;
  };
  lineItems: Array<{
    description?: string;
    code?: string;
    codeType?: 'CPT' | 'HCPCS' | 'ICD10' | 'REV' | 'POS';
    modifiers?: string[];
    units?: number;
    charge?: MoneyCents;
    allowed?: MoneyCents;
    planPaid?: MoneyCents;
    patientResp?: MoneyCents;
    dos?: string;
    pos?: string;
    npi?: string;
    bbox?: [number, number, number, number];
    note?: string; // For unstructured_row and other flags
  }>;
  carcRarc?: Array<{
    code: string;
    description: string;
    category: 'CARC' | 'RARC';
  }>;
  appealInfo?: {
    address: string;
    deadline?: string;
  };
  facilityType?: string;
  preventiveIndicators?: string[];
}

export class EnhancedOCRPipeline {
  private tesseractWorker: any = null;

  async initializeTesseract(): Promise<void> {
    if (!this.tesseractWorker) {
      this.tesseractWorker = await createWorker();
      await this.tesseractWorker.loadLanguage('eng');
      await this.tesseractWorker.initialize('eng');

      // Configure for better medical document recognition
      await this.tesseractWorker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,()-/$#@: ',
        tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
        preserve_interword_spaces: '1'
      });
    }
  }

  async processDocument(buffer: Buffer, mimeType: string, artifact: DocumentArtifact): Promise<ExtractedData> {
    console.log(`🔍 Processing ${artifact.filename} with enhanced OCR pipeline`);

    try {
      // Try cloud OCR first (AWS Textract simulation - in production would use actual service)
      const cloudResult = await this.tryCloudOCR(buffer, mimeType);
      if (cloudResult) {
        console.log('✅ Cloud OCR successful');
        return this.extractDataFromOCR(cloudResult, artifact);
      }
    } catch (error) {
      console.log('⚠️ Cloud OCR failed, falling back to Tesseract');
    }

    // Fallback to Tesseract
    const tesseractResult = await this.runTesseractOCR(buffer);
    return this.extractDataFromOCR(tesseractResult, artifact);
  }

  private async tryCloudOCR(buffer: Buffer, mimeType: string): Promise<OCRResult | null> {
    // In production, this would call AWS Textract, Google Vision API, or Azure Cognitive Services
    // For now, we'll simulate cloud OCR failure to always use Tesseract
    // This is where you'd implement the actual cloud service calls

    if (process.env.AWS_TEXTRACT_ENABLED === 'true') {
      // Would implement AWS Textract call here
      // return await this.callAWSTextract(buffer);
    }

    if (process.env.GOOGLE_VISION_ENABLED === 'true') {
      // Would implement Google Vision API call here
      // return await this.callGoogleVision(buffer);
    }

    return null; // Force fallback to Tesseract for now
  }

  private async runTesseractOCR(buffer: Buffer): Promise<OCRResult> {
    await this.initializeTesseract();

    const { data } = await this.tesseractWorker.recognize(buffer);

    // Convert Tesseract format to our OCRResult format
    const words = data.words?.map((word: any) => ({
      text: word.text,
      bbox: [word.bbox.x0, word.bbox.y0, word.bbox.x1 - word.bbox.x0, word.bbox.y1 - word.bbox.y0] as [number, number, number, number],
      confidence: word.confidence / 100
    })) || [];

    const paragraphs = data.paragraphs?.map((para: any) => ({
      text: para.text,
      bbox: [para.bbox.x0, para.bbox.y0, para.bbox.x1 - para.bbox.x0, para.bbox.y1 - para.bbox.y0] as [number, number, number, number]
    })) || [];

    return {
      text: data.text,
      confidence: data.confidence / 100,
      words,
      layout: { paragraphs }
    };
  }

  private extractDataFromOCR(ocrResult: OCRResult, artifact: DocumentArtifact): ExtractedData {
    const text = ocrResult.text;
    const words = ocrResult.words;

    console.log(`📋 Extracting structured data from ${artifact.docType} document`);

    const extracted: ExtractedData = {
      lineItems: []
    };

    // Extract provider information
    extracted.providerName = this.extractProviderName(text);
    extracted.providerNPI = this.extractNPI(text);
    extracted.providerTIN = this.extractTIN(text);

    // Extract claim and account IDs
    extracted.claimId = this.extractClaimId(text);
    extracted.accountId = this.extractAccountId(text);

    // Extract payer information
    extracted.payer = this.extractPayer(text);

    // Extract service dates
    extracted.serviceDates = this.extractServiceDates(text);

    // Extract totals
    extracted.totals = this.extractTotals(text, artifact.docType);

    // Extract line items
    extracted.lineItems = this.extractLineItems(text, words, artifact.docType);

    // Extract CARC/RARC codes
    extracted.carcRarc = this.extractCARCRarc(text);

    // Extract appeal information
    extracted.appealInfo = this.extractAppealInfo(text);

    // Extract facility type indicators
    extracted.facilityType = this.extractFacilityType(text);

    // Extract preventive care indicators
    extracted.preventiveIndicators = this.extractPreventiveIndicators(text);

    return extracted;
  }

  private extractProviderName(text: string): string | undefined {
    // Look for common provider name patterns
    const patterns = [
      /provider[:\s]+([^\n]{2,50})/i,
      /billing\s+provider[:\s]+([^\n]{2,50})/i,
      /facility[:\s]+([^\n]{2,50})/i,
      /([A-Z][a-z]+\s+(?:Medical|Health|Hospital|Clinic|Center|Associates|Group|Physician)[^\n]{0,30})/,
      /([A-Z][a-z]+\s+[A-Z][a-z]+\s+(?:MD|DO|PA|NP|RN))/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim().replace(/[^\w\s&.,-]/g, '');
      }
    }

    return undefined;
  }

  private extractNPI(text: string): string | undefined {
    // NPI is exactly 10 digits
    const npiMatch = text.match(/(?:NPI[:\s#]*)?(\d{10})/i);
    return npiMatch ? npiMatch[1] : undefined;
  }

  private extractTIN(text: string): string | undefined {
    // TIN can be 9 digits or XX-XXXXXXX format
    const tinMatches = [
      /(?:TIN|TAX\s*ID)[:\s#]*(\d{2}-\d{7})/i,
      /(?:TIN|TAX\s*ID)[:\s#]*(\d{9})/i
    ];

    for (const pattern of tinMatches) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  private extractClaimId(text: string): string | undefined {
    const patterns = [
      /claim[:\s#]*([A-Z0-9]{8,20})/i,
      /claim\s+number[:\s#]*([A-Z0-9]{8,20})/i,
      /ICN[:\s#]*([A-Z0-9]{8,20})/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  private extractAccountId(text: string): string | undefined {
    const patterns = [
      /account[:\s#]*([A-Z0-9]{6,20})/i,
      /patient\s+account[:\s#]*([A-Z0-9]{6,20})/i,
      /acct[:\s#]*([A-Z0-9]{6,20})/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  private extractPayer(text: string): string | undefined {
    const knownPayers = [
      'Aetna', 'Anthem', 'Blue Cross', 'Blue Shield', 'BCBS', 'Cigna', 'UnitedHealth',
      'United Healthcare', 'Humana', 'Kaiser', 'Medicare', 'Medicaid'
    ];

    for (const payer of knownPayers) {
      const regex = new RegExp(`\\b${payer}[\\w\\s]*`, 'i');
      const match = text.match(regex);
      if (match) {
        return match[0].trim();
      }
    }

    return undefined;
  }

  private extractServiceDates(text: string): { start: string; end?: string } | undefined {
    // Look for date patterns
    const datePatterns = [
      /(?:service\s+date|DOS)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /(?:from|start)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4}).*?(?:to|through)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        const start = this.normalizeDate(match[1]);
        const end = match[2] ? this.normalizeDate(match[2]) : undefined;
        return { start, end };
      }
    }

    return undefined;
  }

  private normalizeDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  }

  private extractTotals(text: string, docType: string): ExtractedData['totals'] {
    const totals: ExtractedData['totals'] = {};

    // Extract monetary amounts
    const amountPatterns = [
      { key: 'billed', patterns: [/(?:total\s+)?(?:billed|charges?)[:\s]*\$?([0-9,]+\.?\d{0,2})/i] },
      { key: 'allowed', patterns: [/(?:allowed|eligible)[:\s]*\$?([0-9,]+\.?\d{0,2})/i] },
      { key: 'planPaid', patterns: [/(?:plan\s+paid|insurance\s+paid|paid\s+by\s+plan)[:\s]*\$?([0-9,]+\.?\d{0,2})/i] },
      { key: 'patientResponsibility', patterns: [/(?:patient\s+(?:responsibility|owes?)|amount\s+due|balance)[:\s]*\$?([0-9,]+\.?\d{0,2})/i] }
    ];

    for (const { key, patterns } of amountPatterns) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const amount = this.parseMoneyToCents(match[1]);
          if (amount !== null) {
            (totals as any)[key] = amount;
            break;
          }
        }
      }
    }

    return totals;
  }

  private parseMoneyToCents(amountStr: string): MoneyCents | null {
    try {
      const cleaned = amountStr.replace(/[,$]/g, '');
      const amount = parseFloat(cleaned);
      return Math.round(amount * 100);
    } catch {
      return null;
    }
  }

  private extractLineItems(text: string, words: OCRResult['words'], docType: string): ExtractedData['lineItems'] {
    const lineItems: ExtractedData['lineItems'] = [];

    // STRICT_EXTRACT mode: Disable synthetic line generation
    const STRICT_EXTRACT = process.env.STRICT_EXTRACT !== 'false'; // Default to true

    // Split text into lines and look for line item patterns
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines or header lines
      if (!line || line.length < 10) continue;

      // Look for CPT/HCPCS codes - STRICT VALIDATION
      const codeMatch = line.match(/\b(\d{5}|[A-Z]\d{4})\b/);
      if (!codeMatch) {
        // In STRICT_EXTRACT mode, don't skip - create unstructured row if has money
        if (STRICT_EXTRACT) {
          const amounts = line.match(/\$?([0-9,]+\.?\d{0,2})/g);
          if (amounts && amounts.length > 0) {
            const charge = this.parseMoneyToCents(amounts[0].replace('$', ''));
            if (charge && charge > 0) {
              lineItems.push({
                code: undefined,
                description: line.trim(),
                charge,
                codeType: undefined,
                note: 'unstructured_row'
              });
            }
          }
        }
        continue;
      }

      const code = codeMatch[1];
      const codeType = /^\d{5}$/.test(code) ? 'CPT' : 'HCPCS';

      // STRICT VALIDATION: Only accept codes with verified context
      if (STRICT_EXTRACT && codeType === 'CPT') {
        if (!this.validateCPTInContext(code, line)) {
          // Create unstructured row instead of dropping
          const amounts = line.match(/\$?([0-9,]+\.?\d{0,2})/g);
          if (amounts && amounts.length > 0) {
            const charge = this.parseMoneyToCents(amounts[0].replace('$', ''));
            if (charge && charge > 0) {
              lineItems.push({
                code: undefined,
                description: line.trim(),
                charge,
                codeType: undefined,
                note: 'unstructured_row'
              });
            }
          }
          continue;
        }
      }

      // Extract modifiers
      const modifierMatch = line.match(/(\d{5}|[A-Z]\d{4})\s*([A-Z0-9]{2}(?:\s*,\s*[A-Z0-9]{2})*)/);
      const modifiers = modifierMatch ? modifierMatch[2].split(/\s*,\s*/) : undefined;

      // Extract description (usually before or after the code)
      const parts = line.split(/\s+/);
      const codeIndex = parts.findIndex(part => part.includes(code));
      const description = parts.slice(0, codeIndex).join(' ') ||
                         parts.slice(codeIndex + 1, codeIndex + 6).join(' ');

      // Extract amounts
      const amounts = line.match(/\$?([0-9,]+\.?\d{0,2})/g);
      const charges = amounts?.map(a => this.parseMoneyToCents(a.replace('$', ''))).filter(a => a !== null) || [];

      // Extract units
      const unitsMatch = line.match(/\b(\d+)\s*(?:unit|qty|each)/i);
      const units = unitsMatch ? parseInt(unitsMatch[1]) : 1;

      // Extract date of service
      const dosMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      const dos = dosMatch ? this.normalizeDate(dosMatch[1]) : undefined;

      const lineItem: ExtractedData['lineItems'][0] = {
        code,
        codeType,
        description: description.trim() || undefined,
        modifiers,
        units,
        dos,
        charge: charges[0] || undefined,
        allowed: charges[1] || undefined,
        planPaid: charges[2] || undefined,
        patientResp: charges[3] || undefined
      };

      // Try to find bbox for this line from words
      const lineWords = words.filter(w =>
        line.toLowerCase().includes(w.text.toLowerCase()) && w.text.length > 2
      );

      if (lineWords.length > 0) {
        const minX = Math.min(...lineWords.map(w => w.bbox[0]));
        const minY = Math.min(...lineWords.map(w => w.bbox[1]));
        const maxX = Math.max(...lineWords.map(w => w.bbox[0] + w.bbox[2]));
        const maxY = Math.max(...lineWords.map(w => w.bbox[1] + w.bbox[3]));
        lineItem.bbox = [minX, minY, maxX - minX, maxY - minY];
      }

      lineItems.push(lineItem);
    }

    return lineItems;
  }

  private extractCARCRarc(text: string): Array<{ code: string; description: string; category: 'CARC' | 'RARC' }> {
    const codes: Array<{ code: string; description: string; category: 'CARC' | 'RARC' }> = [];

    // Look for CARC codes (Claim Adjustment Reason Codes)
    const carcPattern = /(?:CARC|RC)\s*(\d+)[:\s]*([^\n]{10,100})/gi;
    let carcMatch;
    while ((carcMatch = carcPattern.exec(text)) !== null) {
      codes.push({
        code: carcMatch[1],
        description: carcMatch[2].trim(),
        category: 'CARC'
      });
    }

    // Look for RARC codes (Remittance Advice Remark Codes)
    const rarcPattern = /(?:RARC|RMK)\s*([A-Z]\d+)[:\s]*([^\n]{10,100})/gi;
    let rarcMatch;
    while ((rarcMatch = rarcPattern.exec(text)) !== null) {
      codes.push({
        code: rarcMatch[1],
        description: rarcMatch[2].trim(),
        category: 'RARC'
      });
    }

    return codes;
  }

  private extractAppealInfo(text: string): { address: string; deadline?: string } | undefined {
    // Look for appeal address
    const addressMatch = text.match(/(?:appeal|grievance)\s+(?:address|to)[:\s]*([^\n]{20,200})/i);
    if (!addressMatch) return undefined;

    // Look for appeal deadline
    const deadlineMatch = text.match(/(?:appeal|file)\s+(?:within|by|deadline)[:\s]*(\d+\s+days?|\d{1,2}\/\d{1,2}\/\d{4})/i);

    return {
      address: addressMatch[1].trim(),
      deadline: deadlineMatch ? deadlineMatch[1] : undefined
    };
  }

  private extractFacilityType(text: string): string | undefined {
    const facilityPatterns = [
      /hospital/i,
      /emergency\s+(?:room|department)/i,
      /urgent\s+care/i,
      /ambulatory\s+surgery/i,
      /outpatient/i,
      /clinic/i,
      /physician\s+office/i
    ];

    for (const pattern of facilityPatterns) {
      if (pattern.test(text)) {
        return text.match(pattern)?.[0];
      }
    }

    return undefined;
  }

  private extractPreventiveIndicators(text: string): string[] {
    const indicators: string[] = [];

    const preventivePatterns = [
      /preventive/i,
      /screening/i,
      /annual\s+(?:exam|physical)/i,
      /wellness/i,
      /Z\d{2}/g, // ICD-10 Z codes for preventive
      /modifier\s+33/i
    ];

    for (const pattern of preventivePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        indicators.push(matches[0]);
      }
    }

    return indicators;
  }

  /**
   * Validate CPT code in context to prevent hallucination
   */
  private validateCPTInContext(code: string, line: string): boolean {
    // Rule 1: Not a date pattern
    if (/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(code) || /^[12]\d{4}$/.test(code)) {
      return false;
    }

    // Rule 2: Not patient/account ID patterns
    if (line.toLowerCase().includes('patient') || line.toLowerCase().includes('account') || line.toLowerCase().includes('member')) {
      return false;
    }

    // Rule 3: Must have clinical context, not just "office visit" text
    const clinicalTerms = [
      'procedure', 'service', 'visit', 'exam', 'test', 'therapy', 'surgery',
      'injection', 'lab', 'blood', 'office', 'consultation', 'evaluation',
      'treatment', 'medication', 'drug', 'room', 'charge', 'semi-priv',
      'room', 'board', 'nursing', 'pharmacy', 'revenue', 'cpt', 'hcpcs'
    ];

    const lineLower = line.toLowerCase();
    const hasClinicialContext = clinicalTerms.some(term => lineLower.includes(term));

    // Rule 4: Reject generic descriptions that would map to common office visit codes
    const genericDescriptions = ['office visit', 'consultation', 'visit', 'appointment'];
    const isGeneric = genericDescriptions.some(desc => lineLower.trim() === desc);

    // Rule 5: NEVER allow 99213 from generic office visit text
    if (code === '99213' && (isGeneric || lineLower.includes('office visit'))) {
      return false;
    }

    return hasClinicialContext && !isGeneric;
  }

  async cleanup(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
  }
}