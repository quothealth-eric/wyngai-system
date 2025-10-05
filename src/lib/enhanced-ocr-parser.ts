import { DocumentMeta, LineItem, DocumentStructure, OCRConfidence, CarcRarcCode, MoneyCents } from '@/types/analyzer';

export interface EnhancedOCRResult {
  text: string;
  confidence: number;
  structure: DocumentStructure;
  documentMeta: DocumentMeta;
  ocrDetails: OCRConfidence[];
}

export class DocumentParser {
  private ocrText: string;
  private filename: string;
  private pages: number;

  constructor(ocrText: string, filename: string, pages: number = 1) {
    this.ocrText = ocrText;
    this.filename = filename;
    this.pages = pages;
  }

  public parse(): EnhancedOCRResult {
    const normalizedText = this.normalizeText(this.ocrText);
    const docType = this.detectDocumentType(normalizedText);
    const structure = this.extractStructure(normalizedText, docType);
    const documentMeta = this.buildDocumentMeta(structure, docType);

    return {
      text: normalizedText,
      confidence: this.calculateOverallConfidence(structure),
      structure,
      documentMeta,
      ocrDetails: this.extractOCRDetails(normalizedText)
    };
  }

  private normalizeText(text: string): string {
    // Step 1: Basic cleanup
    text = text.replace(/[ \t]+/g, ' ')
               .replace(/\n\s*\n/g, '\n')
               .trim();

    // Step 2: Normalize dates to ISO format where possible
    text = text.replace(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g, (match, month, day, year) => {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    });

    // Step 3: Normalize money amounts
    text = text.replace(/\$\s*([\d,]+\.?\d*)/g, (match, amount) => {
      return `$${amount.replace(/,/g, '')}`;
    });

    // Step 4: Normalize common medical codes
    text = text.replace(/\b(\d{5})\b/g, 'CPT:$1'); // CPT codes
    text = text.replace(/\b([A-Z]\d{4})\b/g, 'HCPCS:$1'); // HCPCS codes

    return text;
  }

  private detectDocumentType(text: string): DocumentMeta['docType'] {
    const lowerText = text.toLowerCase();

    // EOB indicators with high confidence
    const eobIndicators = [
      'explanation of benefits',
      'eob',
      'claim processed',
      'allowed amount',
      'plan paid',
      'patient responsibility',
      'claim number',
      'carc',
      'rarc'
    ];

    // Bill indicators
    const billIndicators = [
      'statement',
      'amount due',
      'balance due',
      'payment due',
      'account number',
      'please pay',
      'remit to'
    ];

    const eobScore = eobIndicators.reduce((score, indicator) =>
      score + (lowerText.includes(indicator) ? 1 : 0), 0);

    const billScore = billIndicators.reduce((score, indicator) =>
      score + (lowerText.includes(indicator) ? 1 : 0), 0);

    if (eobScore >= 3) return 'EOB';
    if (billScore >= 2) return 'BILL';
    if (eobScore > billScore) return 'EOB';
    if (billScore > 0) return 'BILL';

    return 'OTHER';
  }

  private extractStructure(text: string, docType: DocumentMeta['docType']): DocumentStructure {
    const lines = text.split('\n');
    const header = this.extractHeader(lines);
    const totals = this.extractTotals(lines, docType);
    const lineItems = this.extractLineItems(lines, docType);
    const remarkCodes = this.extractRemarkCodes(lines);
    const appealInfo = this.extractAppealInfo(lines);

    return {
      header,
      totals,
      lineItems,
      remarkCodes,
      appealInfo
    };
  }

  private extractHeader(lines: string[]): { [key: string]: string } {
    const header: { [key: string]: string } = {};

    // Look for key-value pairs in the first 20 lines
    const headerLines = lines.slice(0, 20);

    const patterns = [
      { key: 'claimId', regex: /(?:claim|ref|reference)\s*(?:number|#|id)?\s*:?\s*([A-Z0-9\-]{6,20})/i },
      { key: 'accountId', regex: /(?:account|acct)\s*(?:number|#|id)?\s*:?\s*([A-Z0-9\-]{6,20})/i },
      { key: 'policyNumber', regex: /(?:policy|member|id)\s*(?:number|#|id)?\s*:?\s*([A-Z0-9\-]{6,20})/i },
      { key: 'providerName', regex: /(?:provider|facility|clinic|hospital)\s*:?\s*([A-Za-z\s&.,-]{3,50})/i },
      { key: 'providerNPI', regex: /(?:npi)\s*:?\s*(\d{10})/i },
      { key: 'payer', regex: /(?:payer|insurance|insurer)\s*:?\s*([A-Za-z\s&.,-]{3,50})/i },
      { key: 'patientName', regex: /(?:patient|member)\s*(?:name)?\s*:?\s*([A-Za-z\s.,-]{3,40})/i }
    ];

    for (const line of headerLines) {
      for (const pattern of patterns) {
        const match = line.match(pattern.regex);
        if (match && match[1] && !header[pattern.key]) {
          header[pattern.key] = match[1].trim();
        }
      }

      // Extract service dates
      const dateMatch = line.match(/(?:service|date|dos)\s*:?\s*([\d\-]{8,10})/i);
      if (dateMatch && !header.serviceDate) {
        header.serviceDate = dateMatch[1];
      }
    }

    return header;
  }

  private extractTotals(lines: string[], docType: DocumentMeta['docType']): { [key: string]: MoneyCents } {
    const totals: { [key: string]: MoneyCents } = {};

    const patterns = docType === 'EOB' ? [
      { key: 'billed', regex: /(?:billed|charged|total\s*charge)\s*(?:amount)?\s*:?\s*\$?([\d,]+\.?\d*)/i },
      { key: 'allowed', regex: /(?:allowed|approved|eligible)\s*(?:amount)?\s*:?\s*\$?([\d,]+\.?\d*)/i },
      { key: 'planPaid', regex: /(?:plan\s*paid|insurance\s*paid|paid\s*by\s*plan)\s*:?\s*\$?([\d,]+\.?\d*)/i },
      { key: 'patientResponsibility', regex: /(?:patient\s*(?:responsibility|owes|pays)|member\s*responsibility)\s*:?\s*\$?([\d,]+\.?\d*)/i },
      { key: 'deductible', regex: /(?:deductible)\s*(?:applied)?\s*:?\s*\$?([\d,]+\.?\d*)/i },
      { key: 'coinsurance', regex: /(?:coinsurance|co-insurance)\s*:?\s*\$?([\d,]+\.?\d*)/i },
      { key: 'copay', regex: /(?:copay|co-pay)\s*:?\s*\$?([\d,]+\.?\d*)/i }
    ] : [
      { key: 'totalCharges', regex: /(?:total\s*(?:charges|amount)|amount\s*due|balance\s*due)\s*:?\s*\$?([\d,]+\.?\d*)/i },
      { key: 'insurancePayment', regex: /(?:insurance\s*(?:payment|paid)|paid\s*by\s*insurance)\s*:?\s*\$?([\d,]+\.?\d*)/i },
      { key: 'previousPayments', regex: /(?:previous\s*payment|payment\s*received)\s*:?\s*\$?([\d,]+\.?\d*)/i },
      { key: 'patientBalance', regex: /(?:patient\s*(?:balance|responsibility|amount)|amount\s*due\s*from\s*patient)\s*:?\s*\$?([\d,]+\.?\d*)/i }
    ];

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern.regex);
        if (match && match[1] && !totals[pattern.key]) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount)) {
            totals[pattern.key] = Math.round(amount * 100); // Convert to cents
          }
        }
      }
    }

    return totals;
  }

  private extractLineItems(lines: string[], docType: DocumentMeta['docType']): LineItem[] {
    const lineItems: LineItem[] = [];
    let lineIdCounter = 1;

    // Look for tabular data patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip headers and empty lines
      if (line.length < 10 || this.isHeaderLine(line)) continue;

      // Look for lines with procedure codes and amounts
      const cptMatch = line.match(/(?:CPT:)?(\d{5})/);
      const hcpcsMatch = line.match(/(?:HCPCS:)?([A-Z]\d{4})/);
      const amountMatch = line.match(/\$?([\d,]+\.?\d*)/g);

      if ((cptMatch || hcpcsMatch) && amountMatch) {
        const lineItem: LineItem = {
          lineId: `line_${lineIdCounter++}`,
          raw: line
        };

        // Extract code
        if (cptMatch) {
          lineItem.code = { system: 'CPT', value: cptMatch[1] };
        } else if (hcpcsMatch) {
          lineItem.code = { system: 'HCPCS', value: hcpcsMatch[1] };
        }

        // Extract modifiers
        const modifierMatch = line.match(/(?:mod|modifier)\s*:?\s*([0-9A-Z,\s]+)/i);
        if (modifierMatch) {
          lineItem.modifiers = modifierMatch[1].split(/[,\s]+/).filter(m => m.length === 2);
        }

        // Extract amounts (convert to cents)
        const amounts = amountMatch.map(a => Math.round(parseFloat(a.replace(/[\$,]/g, '')) * 100));
        if (amounts.length >= 1) lineItem.charge = amounts[0];
        if (amounts.length >= 2) lineItem.allowed = amounts[1];
        if (amounts.length >= 3) lineItem.planPaid = amounts[2];
        if (amounts.length >= 4) lineItem.patientResp = amounts[3];

        // Extract units
        const unitsMatch = line.match(/(?:unit|qty|quantity)\s*:?\s*(\d+(?:\.\d+)?)/i);
        if (unitsMatch) {
          lineItem.units = parseFloat(unitsMatch[1]);
        }

        // Extract place of service
        const posMatch = line.match(/(?:pos|place)\s*:?\s*(\d{2})/i);
        if (posMatch) {
          lineItem.pos = posMatch[1];
        }

        // Extract revenue code
        const revMatch = line.match(/(?:rev|revenue)\s*:?\s*(\d{3})/i);
        if (revMatch) {
          lineItem.revenueCode = revMatch[1];
        }

        // Extract description (remaining text after removing codes and amounts)
        let description = line;
        if (cptMatch) description = description.replace(cptMatch[0], '');
        if (hcpcsMatch) description = description.replace(hcpcsMatch[0], '');
        for (const amount of amountMatch) {
          description = description.replace(amount, '');
        }
        lineItem.description = description.replace(/\s+/g, ' ').trim();

        lineItems.push(lineItem);
      }
    }

    return lineItems;
  }

  private extractRemarkCodes(lines: string[]): CarcRarcCode[] {
    const remarkCodes: CarcRarcCode[] = [];

    for (const line of lines) {
      // CARC codes (Claim Adjustment Reason Codes)
      const carcMatch = line.match(/(?:carc|reason)\s*(?:code)?\s*:?\s*(\d{1,3})/i);
      if (carcMatch) {
        remarkCodes.push({
          code: carcMatch[1],
          description: this.getCarcDescription(carcMatch[1]),
          category: 'CARC'
        });
      }

      // RARC codes (Remittance Advice Remark Codes)
      const rarcMatch = line.match(/(?:rarc|remark)\s*(?:code)?\s*:?\s*([A-Z]\d{1,3})/i);
      if (rarcMatch) {
        remarkCodes.push({
          code: rarcMatch[1],
          description: this.getRarcDescription(rarcMatch[1]),
          category: 'RARC'
        });
      }
    }

    return remarkCodes;
  }

  private extractAppealInfo(lines: string[]): { address: string; deadline: string } | undefined {
    let appealAddress = '';
    let appealDeadline = '';

    for (const line of lines) {
      // Look for appeal address
      const addressMatch = line.match(/(?:appeal|grievance)\s*(?:to|address)\s*:?\s*(.+)/i);
      if (addressMatch) {
        appealAddress = addressMatch[1].trim();
      }

      // Look for appeal deadline
      const deadlineMatch = line.match(/(?:appeal|file|submit)\s*(?:by|within|before)\s*:?\s*([\d\-\/]{8,10}|\d+\s*days?)/i);
      if (deadlineMatch) {
        appealDeadline = deadlineMatch[1].trim();
      }
    }

    if (appealAddress || appealDeadline) {
      return { address: appealAddress, deadline: appealDeadline };
    }

    return undefined;
  }

  private isHeaderLine(line: string): boolean {
    const headerKeywords = [
      'date', 'description', 'amount', 'code', 'service', 'provider',
      'claim', 'patient', 'member', 'policy', 'total', 'balance'
    ];

    const lowerLine = line.toLowerCase();
    const keywordCount = headerKeywords.filter(keyword => lowerLine.includes(keyword)).length;

    return keywordCount >= 3 || line.includes('---') || line.includes('===');
  }

  private buildDocumentMeta(structure: DocumentStructure, docType: DocumentMeta['docType']): DocumentMeta {
    const serviceDates = this.extractServiceDateRange(structure.header);

    return {
      sourceFilename: this.filename,
      docType,
      pages: this.pages,
      payer: structure.header.payer,
      providerName: structure.header.providerName,
      providerNPI: structure.header.providerNPI,
      claimId: structure.header.claimId,
      accountId: structure.header.accountId,
      serviceDates,
      totals: {
        billed: structure.totals.billed || structure.totals.totalCharges,
        allowed: structure.totals.allowed,
        planPaid: structure.totals.planPaid || structure.totals.insurancePayment,
        patientResponsibility: structure.totals.patientResponsibility || structure.totals.patientBalance
      }
    };
  }

  private extractServiceDateRange(header: { [key: string]: string }): { start: string; end?: string } | undefined {
    const serviceDate = header.serviceDate;
    if (!serviceDate) return undefined;

    // For now, assume single date
    return { start: serviceDate };
  }

  private calculateOverallConfidence(structure: DocumentStructure): number {
    let score = 0;
    let maxScore = 0;

    // Header completeness (30 points)
    maxScore += 30;
    const headerFields = ['claimId', 'accountId', 'providerName', 'serviceDate'];
    const headerScore = headerFields.filter(field => structure.header[field]).length;
    score += (headerScore / headerFields.length) * 30;

    // Totals extraction (25 points)
    maxScore += 25;
    const totalFields = Object.keys(structure.totals);
    score += Math.min(totalFields.length / 4, 1) * 25;

    // Line items (25 points)
    maxScore += 25;
    const lineItemScore = Math.min(structure.lineItems.length / 3, 1) * 25;
    score += lineItemScore;

    // Document type confidence (20 points)
    maxScore += 20;
    score += 20; // We detected a type, so full points

    return Math.round((score / maxScore) * 100);
  }

  private extractOCRDetails(text: string): OCRConfidence[] {
    // For now, return a single confidence record
    // In a real implementation, this would include bbox coordinates and per-section confidence
    return [{
      page: 1,
      confidence: 85, // Placeholder confidence
      rawText: text.slice(0, 500) // First 500 chars as sample
    }];
  }

  private getCarcDescription(code: string): string {
    // Placeholder - in real implementation, look up from CARC table
    const descriptions: { [key: string]: string } = {
      '1': 'Deductible amount',
      '2': 'Coinsurance amount',
      '3': 'Copayment amount',
      '4': 'Procedure code not covered',
      '5': 'Procedure code/modifier not covered',
      '45': 'Charges exceed fee schedule/maximum allowable',
      '96': 'Non-covered charges',
      '97': 'Payment adjusted because benefits have been exhausted',
      '204': 'Service not covered when performed by this provider type'
    };

    return descriptions[code] || `CARC ${code} - See payer policy for details`;
  }

  private getRarcDescription(code: string): string {
    // Placeholder - in real implementation, look up from RARC table
    const descriptions: { [key: string]: string } = {
      'N1': 'Alert: You may appeal this decision in writing',
      'N2': 'Alert: This allowance is based on your fee schedule',
      'N3': 'Alert: Missing/incomplete/invalid information',
      'N4': 'Alert: Claim/service lacks information needed for adjudication',
      'N5': 'Alert: Provider Medicare number required'
    };

    return descriptions[code] || `RARC ${code} - See remittance advice for details`;
  }
}