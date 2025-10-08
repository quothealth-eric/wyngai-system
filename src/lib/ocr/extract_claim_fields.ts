import { DocumentMeta, LineItem } from '@/types/analyzer';
import { OCRResult, OCRToken, OCRKeyValue } from '@/types/ocr';
import { MoneyCents } from '@/types/common';

export interface ExtractedClaim {
  documentMeta: DocumentMeta;
  lineItems: LineItem[];
  remarks: string[];
  confidence: number;
}

export class ClaimFieldExtractor {
  /**
   * Extracts structured claim fields from OCR result
   */
  public extractFields(
    artifactId: string,
    docType: DocumentMeta['docType'],
    ocrResult: OCRResult
  ): ExtractedClaim {
    console.log(`🔍 Extracting claim fields for ${docType} document`);

    const allText = this.getAllText(ocrResult);
    const documentMeta = this.extractDocumentMeta(artifactId, docType, ocrResult, allText);
    const lineItems = this.extractLineItems(artifactId, ocrResult, allText);
    const remarks = this.extractRemarks(allText);
    const confidence = this.calculateExtractionConfidence(documentMeta, lineItems, ocrResult);

    console.log(`✅ Extracted ${lineItems.length} line items with ${(confidence * 100).toFixed(1)}% confidence`);

    return {
      documentMeta,
      lineItems,
      remarks,
      confidence
    };
  }

  private getAllText(ocrResult: OCRResult): string {
    return ocrResult.tokens.map(token => token.text).join(' ');
  }

  private extractDocumentMeta(
    artifactId: string,
    docType: DocumentMeta['docType'],
    ocrResult: OCRResult,
    allText: string
  ): DocumentMeta {
    const meta: DocumentMeta = {
      artifactId,
      docType
    };

    // Extract provider information
    meta.providerName = this.extractProviderName(allText, ocrResult.kvs);
    meta.providerNPI = this.extractNPI(allText);
    meta.providerTIN = this.extractTIN(allText);

    // Extract payer information
    meta.payer = this.extractPayer(allText);

    // Extract claim/account IDs
    meta.claimId = this.extractClaimId(allText, ocrResult.kvs);
    meta.accountId = this.extractAccountId(allText, ocrResult.kvs);

    // Extract service dates
    meta.serviceDates = this.extractServiceDates(allText, ocrResult.kvs);

    // Extract totals
    meta.totals = this.extractTotals(allText, ocrResult.kvs, docType);

    return meta;
  }

  private extractProviderName(allText: string, kvs: OCRKeyValue[]): string | undefined {
    // Check key-value pairs first
    const providerKV = kvs.find(kv =>
      /provider|billing\s+entity|facility/i.test(kv.key) && kv.value.length > 2
    );

    if (providerKV) {
      return this.cleanProviderName(providerKV.value);
    }

    // Pattern-based extraction
    const patterns = [
      /(?:provider|billing\s+entity|facility)[:\s]+([^\n]{5,50})/i,
      /([A-Z][a-z]+\s+(?:Medical|Health|Hospital|Clinic|Center|Associates|Group)(?:\s+[A-Z][a-z]+)*)/,
      /^([A-Z][A-Z\s&.,]{10,50})(?:\n|\s{3,})/m
    ];

    for (const pattern of patterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        const name = this.cleanProviderName(match[1]);
        if (name.length >= 5) {
          return name;
        }
      }
    }

    return undefined;
  }

  private cleanProviderName(name: string): string {
    return name
      .replace(/[^\w\s&.,-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  private extractNPI(allText: string): string | undefined {
    // NPI is exactly 10 digits
    const npiMatches = allText.match(/(?:NPI[:\s#]*)?(\d{10})/gi);
    if (npiMatches) {
      return npiMatches[0].replace(/\D/g, '');
    }
    return undefined;
  }

  private extractTIN(allText: string): string | undefined {
    // TIN formats: XX-XXXXXXX or XXXXXXXXX
    const tinPatterns = [
      /(?:TIN|TAX\s*ID|EIN)[:\s#]*(\d{2}-\d{7})/i,
      /(?:TIN|TAX\s*ID|EIN)[:\s#]*(\d{9})/i
    ];

    for (const pattern of tinPatterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  private extractPayer(allText: string): string | undefined {
    const knownPayers = [
      'Aetna', 'Anthem', 'Blue Cross', 'Blue Shield', 'BCBS', 'Cigna',
      'UnitedHealth', 'United Healthcare', 'Humana', 'Kaiser Permanente',
      'Medicare', 'Medicaid', 'TRICARE'
    ];

    for (const payer of knownPayers) {
      const regex = new RegExp(`\\b${payer}[\\w\\s]*`, 'i');
      const match = allText.match(regex);
      if (match) {
        return match[0].trim().substring(0, 50);
      }
    }

    return undefined;
  }

  private extractClaimId(allText: string, kvs: OCRKeyValue[]): string | undefined {
    // Check key-value pairs first
    const claimKV = kvs.find(kv =>
      /claim\s*(?:number|#|id)|icn/i.test(kv.key)
    );

    if (claimKV && claimKV.value.length >= 6) {
      return claimKV.value.replace(/[^\w-]/g, '');
    }

    // Pattern-based extraction
    const patterns = [
      /(?:claim\s*(?:number|#|id)|icn)[:\s#]*([A-Z0-9\-]{6,20})/i,
      /\b([A-Z]{2,4}\d{6,15})\b/,
      /\b(\d{10,15})\b/ // Generic long number that might be claim ID
    ];

    for (const pattern of patterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        const id = match[1].replace(/[^\w-]/g, '');
        if (id.length >= 6) {
          return id;
        }
      }
    }

    return undefined;
  }

  private extractAccountId(allText: string, kvs: OCRKeyValue[]): string | undefined {
    // Check key-value pairs first
    const accountKV = kvs.find(kv =>
      /account\s*(?:number|#|id)|patient\s*(?:id|account)/i.test(kv.key)
    );

    if (accountKV && accountKV.value.length >= 4) {
      return accountKV.value.replace(/[^\w-]/g, '');
    }

    // Pattern-based extraction
    const patterns = [
      /(?:account\s*(?:number|#|id)|patient\s*(?:id|account))[:\s#]*([A-Z0-9\-]{4,15})/i,
      /\bACC([A-Z0-9]{6,12})\b/i
    ];

    for (const pattern of patterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        return match[1].replace(/[^\w-]/g, '');
      }
    }

    return undefined;
  }

  private extractServiceDates(allText: string, kvs: OCRKeyValue[]): { start: string; end?: string } | undefined {
    // Check key-value pairs first
    const dateKVs = kvs.filter(kv =>
      /(?:service\s*date|dos|date\s*of\s*service|from|start)/i.test(kv.key)
    );

    if (dateKVs.length > 0) {
      const startDate = this.parseDate(dateKVs[0].value);
      if (startDate) {
        const endKV = kvs.find(kv => /(?:to|end|through)/i.test(kv.key));
        const endDate = endKV ? this.parseDate(endKV.value) : undefined;

        return { start: startDate, end: endDate };
      }
    }

    // Pattern-based extraction
    const datePatterns = [
      /(?:service\s*date|dos)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /(?:from|start)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})[\s\S]*?(?:to|through)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/
    ];

    for (const pattern of datePatterns) {
      const match = allText.match(pattern);
      if (match) {
        const start = this.parseDate(match[1]);
        const end = match[2] ? this.parseDate(match[2]) : undefined;

        if (start) {
          return { start, end };
        }
      }
    }

    return undefined;
  }

  private parseDate(dateStr: string): string | undefined {
    try {
      // Handle common date formats
      const cleaned = dateStr.replace(/[^\d\/\-]/g, '');
      const date = new Date(cleaned);

      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (error) {
      // Ignore parsing errors
    }

    return undefined;
  }

  private extractTotals(
    allText: string,
    kvs: OCRKeyValue[],
    docType: DocumentMeta['docType']
  ): DocumentMeta['totals'] | undefined {
    const totals: DocumentMeta['totals'] = {};

    // Amount extraction patterns
    const amountPatterns = [
      { key: 'billed', patterns: [/(?:total\s+)?(?:billed|charges?)[:\s]*\$?([0-9,]+\.?\d{0,2})/i] },
      { key: 'allowed', patterns: [/(?:allowed|eligible)[:\s]*\$?([0-9,]+\.?\d{0,2})/i] },
      { key: 'planPaid', patterns: [/(?:plan\s+paid|insurance\s+paid|paid\s+by\s+plan)[:\s]*\$?([0-9,]+\.?\d{0,2})/i] },
      { key: 'patientResp', patterns: [/(?:patient\s+(?:responsibility|owes?)|amount\s+due|balance)[:\s]*\$?([0-9,]+\.?\d{0,2})/i] }
    ];

    // Check key-value pairs first
    for (const kv of kvs) {
      const keyLower = kv.key.toLowerCase();

      if (/total|billed|charges?/.test(keyLower)) {
        const amount = this.parseMoneyToCents(kv.value);
        if (amount !== null) totals.billed = amount;
      }

      if (/allowed|eligible/.test(keyLower)) {
        const amount = this.parseMoneyToCents(kv.value);
        if (amount !== null) totals.allowed = amount;
      }

      if (/plan\s*paid|insurance\s*paid/.test(keyLower)) {
        const amount = this.parseMoneyToCents(kv.value);
        if (amount !== null) totals.planPaid = amount;
      }

      if (/patient|responsibility|due|balance/.test(keyLower)) {
        const amount = this.parseMoneyToCents(kv.value);
        if (amount !== null) totals.patientResp = amount;
      }
    }

    // Pattern-based extraction for missing fields
    for (const { key, patterns } of amountPatterns) {
      if (!(totals as any)[key]) {
        for (const pattern of patterns) {
          const match = allText.match(pattern);
          if (match && match[1]) {
            const amount = this.parseMoneyToCents(match[1]);
            if (amount !== null) {
              (totals as any)[key] = amount;
              break;
            }
          }
        }
      }
    }

    return Object.keys(totals).length > 0 ? totals : undefined;
  }

  private extractLineItems(artifactId: string, ocrResult: OCRResult, allText: string): LineItem[] {
    const lineItems: LineItem[] = [];

    // Try table-based extraction first
    if (ocrResult.tables.length > 0) {
      const tableItems = this.extractLineItemsFromTables(artifactId, ocrResult.tables);
      lineItems.push(...tableItems);
    }

    // Pattern-based extraction for line items not in tables
    if (lineItems.length === 0) {
      const patternItems = this.extractLineItemsFromPatterns(artifactId, allText, ocrResult.tokens);
      lineItems.push(...patternItems);
    }

    return lineItems;
  }

  private extractLineItemsFromTables(artifactId: string, tables: any[]): LineItem[] {
    const lineItems: LineItem[] = [];

    for (const table of tables) {
      for (let rowIndex = 1; rowIndex < table.rows.length; rowIndex++) { // Skip header row
        const row = table.rows[rowIndex];
        if (!row || row.length < 2) continue;

        const lineItem = this.parseTableRowToLineItem(artifactId, row, rowIndex, table.page);
        if (lineItem) {
          lineItems.push(lineItem);
        }
      }
    }

    return lineItems;
  }

  private parseTableRowToLineItem(
    artifactId: string,
    row: any[],
    rowIndex: number,
    page: number
  ): LineItem | null {
    const cells = row.map(cell => (cell.text || '').trim());

    // Skip empty rows
    if (cells.every(cell => !cell)) return null;

    const lineItem: LineItem = {
      lineId: `${artifactId}_line_${rowIndex}`,
      artifactId,
      ocr: { page, conf: 0.8 }
    };

    // Try to identify columns by content patterns
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];

      // CPT/HCPCS codes
      if (/^\d{5}$/.test(cell) || /^[A-Z]\d{4}$/.test(cell)) {
        lineItem.code = cell;
      }

      // Modifiers (2-character codes)
      else if (/^[A-Z0-9]{2}(,\s*[A-Z0-9]{2})*$/.test(cell)) {
        lineItem.modifiers = cell.split(',').map((m: string) => m.trim());
      }

      // Units (integers or decimals)
      else if (/^\d+(\.\d+)?$/.test(cell) && parseFloat(cell) < 100) {
        lineItem.units = parseFloat(cell);
      }

      // Dates
      else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cell)) {
        lineItem.dos = this.parseDate(cell);
      }

      // Money amounts
      else if (/^\$?[\d,]+\.?\d{0,2}$/.test(cell)) {
        const amount = this.parseMoneyToCents(cell);
        if (amount !== null) {
          // Assign to appropriate field based on column position and other context
          if (!lineItem.charge && amount > 0) {
            lineItem.charge = amount;
          } else if (!lineItem.allowed && amount > 0) {
            lineItem.allowed = amount;
          } else if (!lineItem.planPaid && amount >= 0) {
            lineItem.planPaid = amount;
          } else if (!lineItem.patientResp && amount >= 0) {
            lineItem.patientResp = amount;
          }
        }
      }

      // POS codes
      else if (/^\d{2}$/.test(cell)) {
        lineItem.pos = cell;
      }

      // Revenue codes
      else if (/^\d{3,4}$/.test(cell) && parseInt(cell) >= 100) {
        lineItem.revCode = cell;
      }

      // NPI
      else if (/^\d{10}$/.test(cell)) {
        lineItem.npi = cell;
      }

      // Description (longer text)
      else if (cell.length > 5 && !lineItem.description) {
        lineItem.description = cell.substring(0, 100);
      }
    }

    // Only return line item if it has essential fields
    return (lineItem.code || lineItem.description) ? lineItem : null;
  }

  private extractLineItemsFromPatterns(
    artifactId: string,
    allText: string,
    tokens: OCRToken[]
  ): LineItem[] {
    const lineItems: LineItem[] = [];
    const lines = allText.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex].trim();
      if (line.length < 10) continue;

      // Look for lines that contain procedure codes
      const codeMatch = line.match(/\b(\d{5}|[A-Z]\d{4})\b/);
      if (!codeMatch) continue;

      const lineItem: LineItem = {
        lineId: `${artifactId}_pattern_${lineIndex}`,
        artifactId,
        code: codeMatch[1],
        ocr: { page: 1, conf: 0.7 }
      };

      // Extract other fields from the same line
      this.parseLineItemFieldsFromText(lineItem, line);

      lineItems.push(lineItem);
    }

    return lineItems;
  }

  private parseLineItemFieldsFromText(lineItem: LineItem, line: string): void {
    // Extract description (text before or after code)
    const descMatch = line.match(/([A-Za-z\s]{10,50})(?:\s+\d{5}|\s+[A-Z]\d{4})/);
    if (descMatch) {
      lineItem.description = descMatch[1].trim();
    }

    // Extract modifiers
    const modifierMatch = line.match(/\b([A-Z0-9]{2}(?:,\s*[A-Z0-9]{2})*)\b/);
    if (modifierMatch) {
      lineItem.modifiers = modifierMatch[1].split(',').map(m => m.trim());
    }

    // Extract monetary amounts
    const amounts = line.match(/\$?([0-9,]+\.?\d{0,2})/g);
    if (amounts) {
      const parsedAmounts = amounts
        .map(a => this.parseMoneyToCents(a.replace('$', '')))
        .filter(a => a !== null) as MoneyCents[];

      if (parsedAmounts.length >= 1) lineItem.charge = parsedAmounts[0];
      if (parsedAmounts.length >= 2) lineItem.allowed = parsedAmounts[1];
      if (parsedAmounts.length >= 3) lineItem.planPaid = parsedAmounts[2];
      if (parsedAmounts.length >= 4) lineItem.patientResp = parsedAmounts[3];
    }

    // Extract date
    const dateMatch = line.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    if (dateMatch) {
      lineItem.dos = this.parseDate(dateMatch[1]);
    }

    // Extract units
    const unitsMatch = line.match(/\b(\d{1,3})\s*(?:unit|qty|each)/i);
    if (unitsMatch) {
      lineItem.units = parseInt(unitsMatch[1]);
    }
  }

  private parseMoneyToCents(amountStr: string): MoneyCents | null {
    try {
      const cleaned = amountStr.replace(/[,$]/g, '');
      const amount = parseFloat(cleaned);
      if (!isNaN(amount) && amount >= 0) {
        return Math.round(amount * 100);
      }
    } catch (error) {
      // Ignore parsing errors
    }
    return null;
  }

  private extractRemarks(allText: string): string[] {
    const remarks: string[] = [];

    // CARC/RARC codes
    const carcMatches = allText.match(/(?:CARC|RC)\s*(\d+)[:\s]*([^\n]{10,100})/gi);
    if (carcMatches) {
      remarks.push(...carcMatches);
    }

    const rarcMatches = allText.match(/(?:RARC|RMK)\s*([A-Z]\d+)[:\s]*([^\n]{10,100})/gi);
    if (rarcMatches) {
      remarks.push(...rarcMatches);
    }

    // Key phrases
    const keyPhrases = [
      'facility fee', 'preventive', 'observation', 'ER', 'emergency',
      'global period', 'out-of-network', 'timely filing', 'prior authorization'
    ];

    for (const phrase of keyPhrases) {
      if (allText.toLowerCase().includes(phrase.toLowerCase())) {
        remarks.push(phrase);
      }
    }

    return remarks;
  }

  private calculateExtractionConfidence(
    meta: DocumentMeta,
    lineItems: LineItem[],
    ocrResult: OCRResult
  ): number {
    let confidence = 0.5; // Base confidence

    // OCR quality contributes 30%
    const avgOcrConf = ocrResult.tokens.reduce((sum, token) => sum + token.conf, 0) /
                      Math.max(1, ocrResult.tokens.length);
    confidence += avgOcrConf * 0.3;

    // Data completeness contributes 40%
    let completenessScore = 0;

    if (meta.providerName) completenessScore += 0.1;
    if (meta.claimId || meta.accountId) completenessScore += 0.1;
    if (meta.serviceDates) completenessScore += 0.1;
    if (meta.totals && Object.keys(meta.totals).length > 0) completenessScore += 0.1;

    confidence += completenessScore;

    // Line items quality contributes 30%
    if (lineItems.length > 0) {
      const itemsWithCodes = lineItems.filter(item => item.code);
      const itemsWithAmounts = lineItems.filter(item => item.charge);

      const lineItemScore = (itemsWithCodes.length / lineItems.length * 0.15) +
                           (itemsWithAmounts.length / lineItems.length * 0.15);

      confidence += lineItemScore;
    }

    return Math.min(0.98, Math.max(0.1, confidence));
  }
}