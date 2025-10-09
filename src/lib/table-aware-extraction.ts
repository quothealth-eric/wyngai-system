import { OCRResult, OCRToken, OCRTable, OCRTableCell } from '@/types/ocr';
import { LineItem } from '@/types/analyzer';
import { MoneyCents } from '@/types/common';

export interface ColumnMap {
  codeCol?: number;
  descCol?: number;
  unitsCol?: number;
  chargeCol?: number;
  allowedCol?: number;
  paidCol?: number;
  respCol?: number;
  posCol?: number;
  revCol?: number;
  dosCol?: number;
}

export interface ExtractedRow {
  rowIdx: number;
  cells: OCRToken[];
  lineItem?: LineItem;
  isHeader: boolean;
  confidence: number;
}

export class TableAwareExtractor {
  // Global switch to enforce strict table-anchored extraction
  private readonly STRICT_EXTRACT = process.env.STRICT_EXTRACT !== 'false'; // Default to true

  private readonly HEADER_SYNONYMS = {
    description: ['description', 'desc', 'procedure', 'service', 'item', 'charges for'],
    charges: ['charges', 'charge', 'amount', 'billed', 'total', 'cost', 'fee'],
    adjustments: ['adjustments', 'adj', 'discount', 'write-off', 'reduction'],
    payment: ['payment received', 'paid', 'payment', 'plan paid', 'insurance paid'],
    balance: ['balance', 'patient resp', 'patient responsibility', 'due', 'owe'],
    units: ['units', 'qty', 'quantity', 'count', 'each'],
    cpt: ['cpt', 'hcpcs', 'code', 'proc code', 'procedure code'],
    pos: ['pos', 'place of service', 'location'],
    rev: ['rev', 'revenue', 'revenue code'],
    date: ['date', 'dos', 'service date', 'date of service'],
  };

  /**
   * Extract line items using table-aware column detection
   */
  public extractLineItems(
    artifactId: string,
    caseId: string,
    ocrResult: OCRResult,
    docType: string
  ): LineItem[] {
    console.log('🔍 Starting table-aware extraction...');

    // First try structured tables from OCR
    if (ocrResult.tables && ocrResult.tables.length > 0) {
      console.log(`📊 Processing ${ocrResult.tables.length} detected tables`);
      return this.extractFromTables(artifactId, caseId, ocrResult.tables);
    }

    // Fallback to text-based table detection
    console.log('📝 Falling back to text-based table detection');
    return this.extractFromTextBlocks(artifactId, caseId, ocrResult);
  }

  private extractFromTables(artifactId: string, caseId: string, tables: OCRTable[]): LineItem[] {
    const lineItems: LineItem[] = [];

    for (const table of tables) {
      if (table.rows.length < 2) continue; // Need header + at least one data row

      // Find header row and build column map
      const headerRowIdx = this.findHeaderRow(table.rows);
      if (headerRowIdx === -1) continue;

      const columnMap = this.buildColumnMap(table.rows[headerRowIdx]);
      console.log('📋 Column map:', columnMap);

      // Extract data rows
      for (let rowIdx = headerRowIdx + 1; rowIdx < table.rows.length; rowIdx++) {
        const row = table.rows[rowIdx];
        const lineItem = this.extractLineItemFromRow(
          artifactId,
          caseId,
          row,
          columnMap,
          table.page || 1,
          rowIdx
        );

        if (lineItem) {
          lineItems.push(lineItem);
        }
      }
    }

    return lineItems;
  }

  private extractFromTextBlocks(artifactId: string, caseId: string, ocrResult: OCRResult): LineItem[] {
    const lineItems: LineItem[] = [];

    // Group tokens by lines (similar Y coordinates)
    const lines = this.groupTokensByLines(ocrResult.tokens);

    // Find header line
    const headerLineIdx = this.findHeaderLine(lines);
    if (headerLineIdx === -1) {
      console.warn('⚠️ No header line found, using pattern-based extraction');
      return this.extractWithPatterns(artifactId, caseId, ocrResult);
    }

    const columnMap = this.buildColumnMapFromTokens(lines[headerLineIdx]);
    console.log('📋 Text-based column map:', columnMap);

    // Extract data lines
    for (let lineIdx = headerLineIdx + 1; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineItem = this.extractLineItemFromTokens(
        artifactId,
        caseId,
        line,
        columnMap,
        lineIdx
      );

      if (lineItem) {
        lineItems.push(lineItem);
      }
    }

    return lineItems;
  }

  private findHeaderRow(rows: OCRTableCell[][]): number {
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i];
      const rowText = row.map(cell => cell.text.toLowerCase()).join(' ');

      // Check if this row contains header-like terms
      const hasDescription = this.HEADER_SYNONYMS.description.some(syn =>
        rowText.includes(syn.toLowerCase())
      );
      const hasCharges = this.HEADER_SYNONYMS.charges.some(syn =>
        rowText.includes(syn.toLowerCase())
      );

      if (hasDescription && hasCharges) {
        return i;
      }
    }
    return -1;
  }

  private findHeaderLine(lines: OCRToken[][]): number {
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const lineText = lines[i].map(token => token.text.toLowerCase()).join(' ');

      const hasDescription = this.HEADER_SYNONYMS.description.some(syn =>
        lineText.includes(syn.toLowerCase())
      );
      const hasCharges = this.HEADER_SYNONYMS.charges.some(syn =>
        lineText.includes(syn.toLowerCase())
      );

      if (hasDescription && hasCharges) {
        return i;
      }
    }
    return -1;
  }

  private buildColumnMap(headerRow: OCRTableCell[]): ColumnMap {
    const columnMap: ColumnMap = {};

    headerRow.forEach((cell, colIdx) => {
      const cellText = cell.text.toLowerCase();

      // Check each header synonym category
      if (this.matchesSynonyms(cellText, this.HEADER_SYNONYMS.description)) {
        columnMap.descCol = colIdx;
      } else if (this.matchesSynonyms(cellText, this.HEADER_SYNONYMS.charges)) {
        columnMap.chargeCol = colIdx;
      } else if (this.matchesSynonyms(cellText, this.HEADER_SYNONYMS.payment)) {
        columnMap.paidCol = colIdx;
      } else if (this.matchesSynonyms(cellText, this.HEADER_SYNONYMS.balance)) {
        columnMap.respCol = colIdx;
      } else if (this.matchesSynonyms(cellText, this.HEADER_SYNONYMS.units)) {
        columnMap.unitsCol = colIdx;
      } else if (this.matchesSynonyms(cellText, this.HEADER_SYNONYMS.cpt)) {
        columnMap.codeCol = colIdx;
      } else if (this.matchesSynonyms(cellText, this.HEADER_SYNONYMS.pos)) {
        columnMap.posCol = colIdx;
      } else if (this.matchesSynonyms(cellText, this.HEADER_SYNONYMS.rev)) {
        columnMap.revCol = colIdx;
      } else if (this.matchesSynonyms(cellText, this.HEADER_SYNONYMS.date)) {
        columnMap.dosCol = colIdx;
      }
    });

    return columnMap;
  }

  private buildColumnMapFromTokens(headerTokens: OCRToken[]): ColumnMap {
    // For text-based extraction, we estimate columns based on X positions
    const sortedTokens = [...headerTokens].sort((a, b) => a.bbox[0] - b.bbox[0]);
    const headerText = sortedTokens.map(t => t.text.toLowerCase()).join(' ');

    const columnMap: ColumnMap = {};

    // Simple heuristic: find key terms and their approximate column positions
    sortedTokens.forEach((token, idx) => {
      const tokenText = token.text.toLowerCase();

      if (this.matchesSynonyms(tokenText, this.HEADER_SYNONYMS.description)) {
        columnMap.descCol = idx;
      } else if (this.matchesSynonyms(tokenText, this.HEADER_SYNONYMS.charges)) {
        columnMap.chargeCol = idx;
      } else if (this.matchesSynonyms(tokenText, this.HEADER_SYNONYMS.cpt)) {
        columnMap.codeCol = idx;
      }
    });

    return columnMap;
  }

  private matchesSynonyms(text: string, synonyms: string[]): boolean {
    return synonyms.some(syn => text.includes(syn.toLowerCase()));
  }

  private extractLineItemFromRow(
    artifactId: string,
    caseId: string,
    row: OCRTableCell[],
    columnMap: ColumnMap,
    page: number,
    rowIdx: number
  ): LineItem | null {
    // Must have description and charge to be valid
    if (columnMap.descCol === undefined || columnMap.chargeCol === undefined) {
      return null;
    }

    const descCell = row[columnMap.descCol];
    const chargeCell = row[columnMap.chargeCol];

    if (!descCell || !chargeCell) return null;

    const charge = this.parseMoneyToCents(chargeCell.text);
    if (charge === null || charge === 0) return null;

    // Extract code
    let code: string | undefined;
    if (columnMap.codeCol !== undefined && row[columnMap.codeCol]) {
      code = this.validateAndExtractCode(row[columnMap.codeCol].text, descCell.text, charge);
    } else {
      // Look for code in description prefix
      code = this.extractCodeFromDescription(descCell.text, charge);
    }

    // Debug logging for tests
    if (process.env.NODE_ENV === 'test') {
      console.log(`Extracting row ${rowIdx}: desc="${descCell.text}", charge=${charge}, code=${code}`);
    }

    // Generate line ID using case binding manager
    const lineId = this.generateLineId(caseId, artifactId, code || '', descCell.text, rowIdx);

    const lineItem: LineItem = {
      lineId,
      artifactId,
      code,
      description: this.cleanDescription(descCell.text),
      charge: charge ?? undefined,
      ocr: {
        page,
        bbox: descCell.bbox,
        conf: descCell.conf
      }
    };

    // Extract other fields if available
    if (columnMap.unitsCol !== undefined && row[columnMap.unitsCol]) {
      lineItem.units = this.parseUnits(row[columnMap.unitsCol].text);
    }

    if (columnMap.allowedCol !== undefined && row[columnMap.allowedCol]) {
      lineItem.allowed = this.parseMoneyToCents(row[columnMap.allowedCol].text) ?? undefined;
    }

    if (columnMap.paidCol !== undefined && row[columnMap.paidCol]) {
      lineItem.planPaid = this.parseMoneyToCents(row[columnMap.paidCol].text) ?? undefined;
    }

    if (columnMap.respCol !== undefined && row[columnMap.respCol]) {
      lineItem.patientResp = this.parseMoneyToCents(row[columnMap.respCol].text) ?? undefined;
    }

    if (columnMap.dosCol !== undefined && row[columnMap.dosCol]) {
      lineItem.dos = this.parseDate(row[columnMap.dosCol].text);
    }

    if (columnMap.posCol !== undefined && row[columnMap.posCol]) {
      lineItem.pos = this.validatePOS(row[columnMap.posCol].text);
    }

    if (columnMap.revCol !== undefined && row[columnMap.revCol]) {
      lineItem.revCode = this.validateRevCode(row[columnMap.revCol].text);
    }

    return lineItem;
  }

  private extractLineItemFromTokens(
    artifactId: string,
    caseId: string,
    tokens: OCRToken[],
    columnMap: ColumnMap,
    lineIdx: number
  ): LineItem | null {
    // For text-based extraction, we need to identify columns by position
    const sortedTokens = [...tokens].sort((a, b) => a.bbox[0] - b.bbox[0]);
    const lineText = sortedTokens.map(t => t.text).join(' ');

    // Look for monetary amounts
    const amounts = this.extractMonetaryAmounts(lineText);
    if (amounts.length === 0) return null;

    const charge = amounts[0]; // First amount is typically the charge

    // Extract description (longest text token that's not a number)
    const descriptionToken = sortedTokens.find(token =>
      token.text.length > 5 && !/^\d+\.?\d*$/.test(token.text)
    );

    if (!descriptionToken) return null;

    // Extract code
    const code = this.extractCodeFromDescription(lineText, charge);

    const lineId = this.generateLineId(caseId, artifactId, code || '', descriptionToken.text, lineIdx);

    return {
      lineId,
      artifactId,
      code,
      description: this.cleanDescription(descriptionToken.text),
      charge,
      ocr: {
        page: 1,
        bbox: descriptionToken.bbox,
        conf: descriptionToken.conf
      }
    };
  }

  /**
   * Validate and extract medical code with strict rules - HALLUCINATION PREVENTION
   */
  private validateAndExtractCode(codeText: string, descText: string, amount: number): string | undefined {
    const cleanCode = codeText.trim();

    // HCPCS codes: Letter followed by 4 digits (A9150, J1200, J7999, J8499, J7120)
    if (/^[A-Z]\d{4}$/.test(cleanCode)) {
      return cleanCode;
    }

    // CPT codes: 5 digits, but ONLY with strict table context validation
    if (/^\d{5}$/.test(cleanCode)) {
      return this.validateCPTCodeStrict(cleanCode, descText, amount);
    }

    return undefined;
  }

  /**
   * STRICT CPT code validation - PREVENTS 99213 HALLUCINATION
   */
  private validateCPTCodeStrict(code: string, description: string, amount: number): string | undefined {
    // STRICT_EXTRACT mode: If we can't prove it's from a table context, reject it
    if (this.STRICT_EXTRACT) {
      // Only accept CPT codes that are explicitly in a table cell/column
      // This prevents "office visit" text from becoming 99213
      if (this.isFromTableContext(description)) {
        return this.validateCPTCodeCore(code, description, amount);
      }
      // If not from table context, return undefined to force unstructured_row
      return undefined;
    }

    // Legacy validation for non-strict mode
    return this.validateCPTCodeCore(code, description, amount);
  }

  /**
   * Core CPT validation logic
   */
  private validateCPTCodeCore(code: string, description: string, amount: number): string | undefined {
    // Rule 1: Must have money
    if (!amount || amount <= 0) {
      return undefined;
    }

    // Rule 2: Not a date pattern
    if (this.looksLikeDate(code)) {
      return undefined;
    }

    // Rule 3: Not patient/account ID patterns
    if (this.looksLikePatientId(code, description)) {
      return undefined;
    }

    // Rule 4: Surrounding text should look clinical, NOT just free text
    if (!this.hasClinicallySoundingContext(description)) {
      return undefined;
    }

    // Rule 5: NEVER allow mapping of free text like "office visit" to 99213
    if (this.isFreeTextMapping(code, description)) {
      return undefined;
    }

    return code;
  }

  /**
   * Check if this code appears to be from actual table context vs free text
   */
  private isFromTableContext(description: string): boolean {
    // Table context indicators:
    // - Structured format with clear columns
    // - Multiple monetary values in same line
    // - Specific medical procedure language (not generic)
    // - EOB-style format with structured data
    const hasMultipleAmounts = (description.match(/\$[\d,]+\.?\d*/g) || []).length >= 2;
    const hasStructuredFormat = /\d{5}\s+[A-Z][a-z]+/.test(description); // Code followed by capitalized text
    const hasTableMarkers = description.includes('\t') || /\s{3,}/.test(description); // Tabs or multiple spaces

    // EOB-specific patterns
    const hasEOBStructure = /\d{5}\s+(?:OFFICE|VISIT|EST|PATIENT|CONSULTATION|EXAM)/.test(description);
    const hasDetailedDescription = description.split(' ').length >= 4; // Multi-word structured description

    return hasMultipleAmounts || hasStructuredFormat || hasTableMarkers || hasEOBStructure || hasDetailedDescription;
  }

  /**
   * Detect prohibited free text mappings that lead to hallucination
   */
  private isFreeTextMapping(code: string, description: string): boolean {
    const descLower = description.toLowerCase();

    // NEVER map these common text patterns to CPT codes UNLESS they're in structured context:
    const prohibitedMappings = [
      'office visit',
      'consultation',
      'visit',
      'appointment',
      'checkup',
      'evaluation',
      'assessment'
    ];

    // If description is just one of these generic terms WITHOUT structure, reject the code
    const isGenericDescription = prohibitedMappings.some(term =>
      descLower.trim() === term
    );

    // However, if it's structured like "99213 OFFICE VISIT EST PATIENT" that's okay
    const hasCodePrefixStructure = /^\d{5}\s+/.test(description);

    // Debug logging for tests
    if (process.env.NODE_ENV === 'test') {
      console.log(`isFreeTextMapping check: code=${code}, desc="${description}", isGeneric=${isGenericDescription}, hasStructure=${hasCodePrefixStructure}`);
    }

    return isGenericDescription && !hasCodePrefixStructure;
  }

  private extractCodeFromDescription(description: string, amount: number): string | undefined {
    // STRICT_EXTRACT: Only extract codes that are clearly at the start of structured data
    if (this.STRICT_EXTRACT) {
      // Must be at very beginning with clear separation (space, tab, or punctuation)
      const strictCodeMatch = description.match(/^(\d{5}|[A-Z]\d{4})(?:\s|\t|[^\w])/);
      if (strictCodeMatch) {
        return this.validateAndExtractCode(strictCodeMatch[1], description, amount);
      }
      return undefined;
    }

    // Legacy: Look for codes at the beginning of description
    const codeMatch = description.match(/^(\d{5}|[A-Z]\d{4})\b/);
    if (codeMatch) {
      return this.validateAndExtractCode(codeMatch[1], description, amount);
    }

    return undefined;
  }

  private looksLikeDate(code: string): boolean {
    // Common date patterns that might be 5 digits
    return /^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(code) || // MMDD
           /^[12]\d{4}$/.test(code); // Years like 12024, 22024
  }

  private looksLikePatientId(code: string, context: string): boolean {
    const contextLower = context.toLowerCase();
    return contextLower.includes('patient') ||
           contextLower.includes('account') ||
           contextLower.includes('member') ||
           contextLower.includes('id');
  }

  private hasClinicallySoundingContext(description: string): boolean {
    const clinicalTerms = [
      'procedure', 'service', 'visit', 'exam', 'test', 'therapy', 'surgery',
      'injection', 'lab', 'blood', 'office', 'consultation', 'evaluation',
      'treatment', 'medication', 'drug', 'room', 'charge', 'semi-priv',
      'room', 'board', 'nursing', 'pharmacy'
    ];

    const descLower = description.toLowerCase();
    return clinicalTerms.some(term => descLower.includes(term)) &&
           /[a-zA-Z\s]/.test(description); // Has letters and spaces, not all digits
  }

  private validatePOS(text: string): string | undefined {
    const match = text.match(/^\d{2}$/);
    return match ? match[0] : undefined;
  }

  private validateRevCode(text: string): string | undefined {
    const match = text.match(/^\d{3}$/);
    return match ? match[0] : undefined;
  }

  private groupTokensByLines(tokens: OCRToken[]): OCRToken[][] {
    // Group tokens by similar Y coordinates (allowing some tolerance)
    const lines: OCRToken[][] = [];
    const tolerance = 10; // pixels

    tokens.forEach(token => {
      const y = token.bbox[1];

      // Find existing line with similar Y coordinate
      let targetLine = lines.find(line => {
        const lineY = line[0]?.bbox[1] || 0;
        return Math.abs(y - lineY) <= tolerance;
      });

      if (!targetLine) {
        targetLine = [];
        lines.push(targetLine);
      }

      targetLine.push(token);
    });

    // Sort tokens within each line by X coordinate
    lines.forEach(line => {
      line.sort((a, b) => a.bbox[0] - b.bbox[0]);
    });

    return lines;
  }

  private extractWithPatterns(artifactId: string, caseId: string, ocrResult: OCRResult): LineItem[] {
    // Fallback to original pattern-based extraction but with validation
    const lineItems: LineItem[] = [];
    const allText = ocrResult.tokens.map(token => token.text).join(' ');
    const lines = allText.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex].trim();
      if (line.length < 10) continue;

      // Extract monetary amounts first
      const amounts = this.extractMonetaryAmounts(line);
      if (amounts.length === 0) continue;

      const charge = amounts[0];

      // STRICT_EXTRACT: Only accept validated codes, no synthetic generation
      const codeMatch = line.match(/\b(\d{5}|[A-Z]\d{4})\b/);
      if (!codeMatch) {
        // In STRICT_EXTRACT mode, create unstructured row instead of skipping
        if (this.STRICT_EXTRACT) {
          const lineId = this.generateLineId(caseId, artifactId, '', line, lineIndex);
          lineItems.push({
            lineId,
            artifactId,
            code: undefined,
            description: line.trim(),
            charge,
            ocr: { page: 1, conf: 0.7 },
            note: 'unstructured_row'
          } as LineItem);
        }
        continue;
      }

      const code = this.validateAndExtractCode(codeMatch[1], line, charge);
      if (!code) {
        // In STRICT_EXTRACT mode, create unstructured row for invalid codes
        if (this.STRICT_EXTRACT) {
          const lineId = this.generateLineId(caseId, artifactId, '', line, lineIndex);
          lineItems.push({
            lineId,
            artifactId,
            code: undefined,
            description: line.trim(),
            charge,
            ocr: { page: 1, conf: 0.7 },
            note: 'unstructured_row'
          } as LineItem);
        }
        continue;
      }

      const lineId = this.generateLineId(caseId, artifactId, code, line, lineIndex);

      const lineItem: LineItem = {
        lineId,
        artifactId,
        code,
        description: this.extractDescription(line),
        charge,
        ocr: { page: 1, conf: 0.7 }
      };

      // Extract additional fields
      this.parseAdditionalFields(lineItem, line);
      lineItems.push(lineItem);
    }

    return lineItems;
  }

  private extractMonetaryAmounts(text: string): number[] {
    const amounts = text.match(/\$?([0-9,]+\.?\d{0,2})/g);
    if (!amounts) return [];

    return amounts
      .map(a => this.parseMoneyToCents(a.replace('$', '')))
      .filter(a => a !== null && a > 0) as number[];
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

  private parseUnits(text: string): number | undefined {
    const match = text.match(/^\d+$/);
    return match ? parseInt(match[0]) : undefined;
  }

  private parseDate(text: string): string | undefined {
    const match = text.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
    return match ? match[0] : undefined;
  }

  private cleanDescription(text: string): string {
    return text.replace(/^\d{5}\s*/, '').replace(/^[A-Z]\d{4}\s*/, '').trim();
  }

  private extractDescription(line: string): string {
    // Remove code from beginning and extract description
    return line.replace(/^\s*(\d{5}|[A-Z]\d{4})\s*/, '').trim();
  }

  private parseAdditionalFields(lineItem: LineItem, line: string): void {
    // Extract modifiers
    const modifierMatch = line.match(/\b([A-Z0-9]{2}(?:,\s*[A-Z0-9]{2})*)\b/);
    if (modifierMatch) {
      lineItem.modifiers = modifierMatch[1].split(',').map(m => m.trim());
    }

    // Extract date
    const dateMatch = line.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    if (dateMatch) {
      lineItem.dos = dateMatch[1];
    }

    // Extract units
    const unitsMatch = line.match(/\b(\d{1,3})\s*(?:unit|qty|each)/i);
    if (unitsMatch) {
      lineItem.units = parseInt(unitsMatch[1]);
    }
  }

  private generateLineId(caseId: string, artifactId: string, code: string, description: string, rowIdx: number): string {
    const input = `${code}|${description}|${artifactId}|${rowIdx}`;
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
    return `${caseId}_${hash}`;
  }
}