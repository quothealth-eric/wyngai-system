import { DocumentArtifact } from '@/types/analyzer';
import { OCRResult } from '@/types/ocr';

export class DocumentClassifier {
  /**
   * Classifies document type using heuristics and optional LLM assistance
   * Returns document type with confidence
   */
  public classifyDocument(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    ocrResult?: OCRResult
  ): { docType: DocumentArtifact['docType']; confidence: number } {

    console.log(`📋 Classifying document: ${filename}`);

    // Extract text for analysis
    const rawText = this.extractTextForClassification(buffer, ocrResult);
    const cleanText = this.sanitizeTextForClassification(rawText);

    // Apply classification rules
    const classification = this.applyClassificationRules(cleanText, filename, mimeType);

    console.log(`✅ Classified as ${classification.docType} with ${(classification.confidence * 100).toFixed(1)}% confidence`);

    return classification;
  }

  private extractTextForClassification(buffer: Buffer, ocrResult?: OCRResult): string {
    let text = '';

    // Use OCR result if available
    if (ocrResult && ocrResult.tokens.length > 0) {
      text = ocrResult.tokens.map(token => token.text).join(' ');
    } else {
      // Fallback to buffer text extraction (for text-based PDFs or simple text)
      text = buffer.toString('utf8', 0, Math.min(4096, buffer.length));
    }

    return text;
  }

  private sanitizeTextForClassification(text: string): string {
    // Remove PHI and clean text for classification
    return text
      .toLowerCase()
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]') // SSN
      .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '[CARD]') // Credit card
      .replace(/\b[A-Z]\d{8,12}\b/g, '[ID]') // Member/Account IDs
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '[DATE]') // Dates
      .replace(/\$\d+\.?\d*/g, '[AMOUNT]') // Dollar amounts
      .replace(/\s+/g, ' ')
      .trim();
  }

  private applyClassificationRules(
    text: string,
    filename: string,
    mimeType: string
  ): { docType: DocumentArtifact['docType']; confidence: number } {

    const filenameLower = filename.toLowerCase();

    // EOB (Explanation of Benefits) Classification
    const eobScore = this.scoreEOB(text, filenameLower);
    if (eobScore > 0.7) {
      return { docType: 'EOB', confidence: eobScore };
    }

    // BILL/Statement Classification
    const billScore = this.scoreBill(text, filenameLower);
    if (billScore > 0.7) {
      return { docType: 'BILL', confidence: billScore };
    }

    // LETTER Classification
    const letterScore = this.scoreLetter(text, filenameLower);
    if (letterScore > 0.7) {
      return { docType: 'LETTER', confidence: letterScore };
    }

    // PORTAL Screenshot Classification
    const portalScore = this.scorePortal(text, filenameLower);
    if (portalScore > 0.7) {
      return { docType: 'PORTAL', confidence: portalScore };
    }

    // INSURANCE_CARD Classification
    const cardScore = this.scoreInsuranceCard(text, filenameLower);
    if (cardScore > 0.7) {
      return { docType: 'INSURANCE_CARD', confidence: cardScore };
    }

    // Determine best classification from all scores
    const scores = [
      { type: 'EOB' as const, score: eobScore },
      { type: 'BILL' as const, score: billScore },
      { type: 'LETTER' as const, score: letterScore },
      { type: 'PORTAL' as const, score: portalScore },
      { type: 'INSURANCE_CARD' as const, score: cardScore }
    ];

    const bestMatch = scores.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    if (bestMatch.score > 0.4) {
      return { docType: bestMatch.type, confidence: bestMatch.score };
    }

    return { docType: 'UNKNOWN', confidence: 0.1 };
  }

  private scoreEOB(text: string, filename: string): number {
    let score = 0;

    // Strong EOB indicators
    const strongIndicators = [
      'explanation of benefits',
      'eob',
      'allowed amount',
      'plan paid',
      'patient responsibility',
      'benefit payment',
      'claim processed'
    ];

    // Medium EOB indicators
    const mediumIndicators = [
      'claim number',
      'member id',
      'provider paid',
      'deductible applied',
      'coinsurance',
      'copayment',
      'out of pocket'
    ];

    // Weak EOB indicators
    const weakIndicators = [
      'insurance',
      'coverage',
      'benefits',
      'processed',
      'payment',
      'medical services'
    ];

    // CARC/RARC codes (strong indicator)
    const carcPattern = /\b(carc|rarc)\s*\d+\b/i;
    if (carcPattern.test(text)) {
      score += 0.3;
    }

    // Check filename
    if (filename.includes('eob') || filename.includes('explanation')) {
      score += 0.2;
    }

    // Score indicators
    strongIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.15;
    });

    mediumIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.08;
    });

    weakIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.03;
    });

    return Math.min(score, 1.0);
  }

  private scoreBill(text: string, filename: string): number {
    let score = 0;

    // Strong BILL indicators
    const strongIndicators = [
      'itemized statement',
      'account statement',
      'billing statement',
      'amount due',
      'balance due',
      'total charges',
      'patient account'
    ];

    // Medium BILL indicators
    const mediumIndicators = [
      'description',
      'procedure code',
      'service date',
      'units',
      'charge',
      'adjustment',
      'balance',
      'due date',
      'payment due'
    ];

    // Look for tabular billing structure
    const hasTableStructure = this.detectBillingTableStructure(text);
    if (hasTableStructure) {
      score += 0.25;
    }

    // CPT/HCPCS codes (strong indicator for bills)
    const cptPattern = /\b\d{5}\b/g;
    const hcpcsPattern = /\b[A-Z]\d{4}\b/g;
    const cptMatches = (text.match(cptPattern) || []).length;
    const hcpcsMatches = (text.match(hcpcsPattern) || []).length;

    if (cptMatches > 0 || hcpcsMatches > 0) {
      score += Math.min(0.2, (cptMatches + hcpcsMatches) * 0.05);
    }

    // Check filename
    if (filename.includes('bill') || filename.includes('statement') || filename.includes('invoice')) {
      score += 0.2;
    }

    // Score indicators
    strongIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.12;
    });

    mediumIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.06;
    });

    return Math.min(score, 1.0);
  }

  private scoreLetter(text: string, filename: string): number {
    let score = 0;

    // Strong LETTER indicators
    const strongIndicators = [
      'denial',
      'appeal',
      'grievance',
      'timely filing',
      'prior authorization',
      'medical necessity',
      'coverage determination'
    ];

    // Medium LETTER indicators
    const mediumIndicators = [
      'dear',
      'sincerely',
      'regarding',
      'reference number',
      'decision',
      'review',
      'request',
      'notification'
    ];

    // Look for letter structure
    const hasLetterStructure = /dear\s+[a-z\s]+,/i.test(text) ||
                              /sincerely,?\s*$/im.test(text) ||
                              /re:\s+/i.test(text);

    if (hasLetterStructure) {
      score += 0.2;
    }

    // Check for denial/appeal language
    if (text.includes('deny') || text.includes('denied') || text.includes('denial')) {
      score += 0.15;
    }

    // Check filename
    if (filename.includes('letter') || filename.includes('denial') || filename.includes('appeal')) {
      score += 0.2;
    }

    // Score indicators
    strongIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.1;
    });

    mediumIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.05;
    });

    return Math.min(score, 1.0);
  }

  private scorePortal(text: string, filename: string): number {
    let score = 0;

    // Strong PORTAL indicators
    const strongIndicators = [
      'member portal',
      'patient portal',
      'login',
      'dashboard',
      'navigation',
      'menu',
      'logout',
      'account settings'
    ];

    // Medium PORTAL indicators
    const mediumIndicators = [
      'view claim',
      'download',
      'claims history',
      'benefits summary',
      'coverage details',
      'find provider',
      'contact us'
    ];

    // UI element indicators
    const uiElements = [
      'button',
      'click here',
      'select',
      'dropdown',
      'checkbox',
      'submit',
      'search'
    ];

    // Check filename for screenshot indicators
    if (filename.includes('screenshot') || filename.includes('portal') || filename.includes('screen')) {
      score += 0.25;
    }

    // Score indicators
    strongIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.15;
    });

    mediumIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.08;
    });

    uiElements.forEach(element => {
      if (text.includes(element)) score += 0.03;
    });

    return Math.min(score, 1.0);
  }

  private scoreInsuranceCard(text: string, filename: string): number {
    let score = 0;

    // Strong INSURANCE_CARD indicators
    const strongIndicators = [
      'member id',
      'group number',
      'bin',
      'pcn',
      'issuer',
      'plan id',
      'effective date'
    ];

    // Medium INSURANCE_CARD indicators
    const mediumIndicators = [
      'coverage',
      'benefits',
      'copay',
      'deductible',
      'pharmacy',
      'provider network',
      'customer service'
    ];

    // Look for card-like structure (compact format)
    const isCompactFormat = text.length < 500; // Insurance cards typically have limited text
    const hasIdNumbers = /\b[A-Z0-9]{6,15}\b/g.test(text);

    if (isCompactFormat && hasIdNumbers) {
      score += 0.2;
    }

    // Check for phone numbers (common on insurance cards)
    const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
    if (phonePattern.test(text)) {
      score += 0.1;
    }

    // Check filename
    if (filename.includes('card') || filename.includes('insurance')) {
      score += 0.2;
    }

    // Score indicators
    strongIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.12;
    });

    mediumIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.06;
    });

    return Math.min(score, 1.0);
  }

  private detectBillingTableStructure(text: string): boolean {
    // Look for patterns that suggest a billing table structure
    const lines = text.split('\n');

    let tableScore = 0;

    for (const line of lines) {
      // Check for table-like patterns
      if (line.trim().length < 10) continue;

      // Look for columns with codes, descriptions, amounts
      const hasCode = /\b\d{5}\b/.test(line) || /\b[A-Z]\d{4}\b/.test(line);
      const hasAmount = /\$[\d,]+\.?\d*/.test(line) || /\b\d+\.\d{2}\b/.test(line);
      const hasMultipleSpaces = /\s{3,}/.test(line);

      if (hasCode && hasAmount) {
        tableScore += 2;
      } else if (hasAmount && hasMultipleSpaces) {
        tableScore += 1;
      }
    }

    return tableScore >= 3;
  }
}