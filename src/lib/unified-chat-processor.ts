// @ts-nocheck
import { UnifiedChatCase, DocumentArtifact, ChatProcessingContext, ExtractedDocumentHeader, ExtractedDocumentTotals, ExtractedLineItem, OCRFieldExtraction, MoneyCents } from '@/types/chat';
import { performOCR } from './ocr';
import { ThemeBank } from '@/types/chat';
import themeBank from '../../knowledge/theme_bank.json';

export class UnifiedChatProcessor {
  private themeBank: ThemeBank;

  constructor() {
    this.themeBank = themeBank as ThemeBank;
  }

  public async processUnifiedCase(
    artifacts: Array<{ buffer: Buffer; filename: string; mimeType: string }>,
    narrative: string,
    benefits?: any,
    themeHints?: string[]
  ): Promise<ChatProcessingContext> {
    const caseId = this.generateCaseId();

    console.log(`🔄 Processing unified chat case ${caseId} with ${artifacts.length} artifacts`);

    // Step 1: Create document artifacts and perform OCR
    const documentArtifacts = await this.createDocumentArtifacts(artifacts);

    // Step 2: Extract structured data from each document
    const extractionResults = await this.extractStructuredData(artifacts, documentArtifacts);

    // Step 3: Build unified case
    const unifiedCase: UnifiedChatCase = {
      caseId,
      artifacts: documentArtifacts,
      narrative: {
        text: narrative,
        themeHints
      },
      benefits,
      inferred: await this.inferCaseContext(extractionResults, narrative)
    };

    // Step 4: Classify themes from narrative
    const themeClassification = this.classifyThemes(narrative, themeHints);

    // Step 5: Calculate confidence scores
    const confidenceScores = this.calculateConfidenceScores(extractionResults);

    const context: ChatProcessingContext = {
      case: unifiedCase,
      extractedHeaders: extractionResults.headers,
      extractedTotals: extractionResults.totals,
      extractedLineItems: extractionResults.lineItems,
      themeClassification,
      confidenceScores
    };

    console.log(`✅ Unified chat case processed: themes=[${themeClassification.join(', ')}], confidence=${confidenceScores.overallOCR}%`);

    return context;
  }

  private async createDocumentArtifacts(files: Array<{ buffer: Buffer; filename: string; mimeType: string }>): Promise<DocumentArtifact[]> {
    const artifacts: DocumentArtifact[] = [];

    for (const file of files) {
      const artifactId = this.generateArtifactId();
      const docType = this.classifyDocumentType(file.buffer, file.mimeType);
      const pages = await this.estimatePageCount(file.buffer, file.mimeType);

      // Perform OCR to get confidence
      let ocrConf = 0.85;
      try {
        const ocrResult = await performOCR(file.buffer, file.mimeType);
        ocrConf = ocrResult.confidence / 100;
      } catch (error) {
        console.warn(`OCR failed for ${file.filename}:`, error);
      }

      artifacts.push({
        artifactId,
        filename: file.filename,
        mime: file.mimeType,
        docType,
        pages,
        ocrConf
      });
    }

    return artifacts;
  }

  private async extractStructuredData(
    files: Array<{ buffer: Buffer; filename: string; mimeType: string }>,
    artifacts: DocumentArtifact[]
  ): Promise<{
    headers: Map<string, ExtractedDocumentHeader>;
    totals: Map<string, ExtractedDocumentTotals>;
    lineItems: Map<string, ExtractedLineItem[]>;
  }> {
    const headers = new Map<string, ExtractedDocumentHeader>();
    const totals = new Map<string, ExtractedDocumentTotals>();
    const lineItems = new Map<string, ExtractedLineItem[]>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const artifact = artifacts[i];

      try {
        console.log(`📄 Extracting data from ${artifact.filename}...`);

        // Perform OCR
        const ocrResult = await performOCR(file.buffer, file.mimeType);

        // Extract header information
        const header = this.extractDocumentHeader(ocrResult.text, artifact.artifactId);
        if (header) {
          headers.set(artifact.artifactId, header);
        }

        // Extract totals
        const docTotals = this.extractDocumentTotals(ocrResult.text, artifact.artifactId);
        if (docTotals) {
          totals.set(artifact.artifactId, docTotals);
        }

        // Extract line items for bills and EOBs
        if (artifact.docType === 'EOB' || artifact.docType === 'BILL') {
          const items = this.extractLineItems(ocrResult.text, artifact.artifactId, artifact.docType);
          if (items.length > 0) {
            lineItems.set(artifact.artifactId, items);
          }
        }

        console.log(`✅ Extracted data from ${artifact.filename}: ${header ? 'header' : 'no header'}, ${docTotals ? 'totals' : 'no totals'}, ${lineItems.get(artifact.artifactId)?.length || 0} line items`);

      } catch (error) {
        console.error(`❌ Failed to extract data from ${artifact.filename}:`, error);
      }
    }

    return { headers, totals, lineItems };
  }

  private extractDocumentHeader(text: string, artifactId: string): ExtractedDocumentHeader | null {
    const header: ExtractedDocumentHeader = {};

    // Extract member information
    const memberIdMatch = text.match(/(?:member|subscriber|id|patient)\s*(?:id|number|#)?\s*:?\s*([A-Z0-9\-]{6,20})/gi);
    if (memberIdMatch) {
      header.memberInfo = {
        memberId: {
          value: memberIdMatch[0].replace(/.*:?\s*/, ''),
          ocr: this.createMockOCR(artifactId, memberIdMatch[0])
        }
      };
    }

    // Extract claim/account information
    const claimIdMatch = text.match(/(?:claim|reference|confirmation)\s*(?:number|id|#)?\s*:?\s*([A-Z0-9\-]{6,20})/gi);
    if (claimIdMatch) {
      header.claimInfo = {
        claimId: {
          value: claimIdMatch[0].replace(/.*:?\s*/, ''),
          ocr: this.createMockOCR(artifactId, claimIdMatch[0])
        }
      };
    }

    const accountIdMatch = text.match(/(?:account|patient account|acct)\s*(?:number|id|#)?\s*:?\s*([A-Z0-9\-]{6,20})/gi);
    if (accountIdMatch) {
      if (!header.claimInfo) header.claimInfo = {};
      header.claimInfo.accountId = {
        value: accountIdMatch[0].replace(/.*:?\s*/, ''),
        ocr: this.createMockOCR(artifactId, accountIdMatch[0])
      };
    }

    // Extract payer information
    const payerMatch = text.match(/(?:aetna|blue cross|blue shield|cigna|united|humana|kaiser|anthem|molina|centene|wellcare|tricare|medicare|medicaid)/gi);
    if (payerMatch) {
      header.payerInfo = {
        payerName: {
          value: payerMatch[0],
          ocr: this.createMockOCR(artifactId, payerMatch[0])
        }
      };
    }

    // Extract provider information
    const providerMatch = text.match(/(?:provider|doctor|physician|clinic|hospital|medical center|health|facility)\s*:?\s*([A-Za-z\s&,.]{3,100})/gi);
    if (providerMatch) {
      header.providerInfo = {
        providerName: {
          value: providerMatch[0].replace(/^[^:]*:?\s*/, '').trim(),
          ocr: this.createMockOCR(artifactId, providerMatch[0])
        }
      };
    }

    const npiMatch = text.match(/(?:NPI|national provider)\s*(?:identifier|id|#)?\s*:?\s*([12]\d{9})/gi);
    if (npiMatch) {
      if (!header.providerInfo) header.providerInfo = {};
      header.providerInfo.npi = {
        value: npiMatch[0].replace(/.*:?\s*/, ''),
        ocr: this.createMockOCR(artifactId, npiMatch[0])
      };
    }

    // Extract service dates
    const serviceDateMatch = text.match(/(?:date of service|service date|dos)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi);
    if (serviceDateMatch) {
      header.serviceDates = {
        start: {
          date: this.normalizeDate(serviceDateMatch[0].replace(/.*:?\s*/, '')),
          ocr: this.createMockOCR(artifactId, serviceDateMatch[0])
        }
      };
    }

    return Object.keys(header).length > 0 ? header : null;
  }

  private extractDocumentTotals(text: string, artifactId: string): ExtractedDocumentTotals | null {
    const totals: ExtractedDocumentTotals = {};

    // Extract billed amount
    const billedMatch = text.match(/(?:total charges?|billed|amount charged)\s*:?\s*\$?([\d,]+\.?\d{0,2})/gi);
    if (billedMatch) {
      totals.billed = {
        amount: this.parseMoney(billedMatch[0]),
        ocr: this.createMockOCR(artifactId, billedMatch[0])
      };
    }

    // Extract allowed amount
    const allowedMatch = text.match(/(?:allowed|approved|covered)\s*(?:amount)?\s*:?\s*\$?([\d,]+\.?\d{0,2})/gi);
    if (allowedMatch) {
      totals.allowed = {
        amount: this.parseMoney(allowedMatch[0]),
        ocr: this.createMockOCR(artifactId, allowedMatch[0])
      };
    }

    // Extract plan paid amount
    const planPaidMatch = text.match(/(?:plan paid|insurance paid|paid by plan|benefit)\s*:?\s*\$?([\d,]+\.?\d{0,2})/gi);
    if (planPaidMatch) {
      totals.planPaid = {
        amount: this.parseMoney(planPaidMatch[0]),
        ocr: this.createMockOCR(artifactId, planPaidMatch[0])
      };
    }

    // Extract patient responsibility
    const patientRespMatch = text.match(/(?:patient (?:owes|responsibility|balance)|balance due|amount due|you owe)\s*:?\s*\$?([\d,]+\.?\d{0,2})/gi);
    if (patientRespMatch) {
      totals.patientResp = {
        amount: this.parseMoney(patientRespMatch[0]),
        ocr: this.createMockOCR(artifactId, patientRespMatch[0])
      };
    }

    return Object.keys(totals).length > 0 ? totals : null;
  }

  private extractLineItems(text: string, artifactId: string, docType: 'EOB' | 'BILL'): ExtractedLineItem[] {
    const lineItems: ExtractedLineItem[] = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length && lineItems.length < 20; i++) {
      const line = lines[i];

      // Look for lines with medical codes
      const cptMatch = line.match(/\b(\d{5})\b/);
      const hcpcsMatch = line.match(/\b([A-Z]\d{4})\b/);

      if (cptMatch || hcpcsMatch) {
        const lineId = `line_${artifactId}_${lineItems.length + 1}`;
        const code = cptMatch ? cptMatch[1] : hcpcsMatch![1];
        const system = cptMatch ? 'CPT' : 'HCPCS';

        const item: ExtractedLineItem = {
          lineId,
          code: {
            value: code,
            system: system as 'CPT' | 'HCPCS',
            ocr: this.createMockOCR(artifactId, code)
          }
        };

        // Extract charges from the line
        const charges: any = {};
        const dollarMatches = line.match(/\$([\d,]+\.?\d{0,2})/g);
        if (dollarMatches && dollarMatches.length > 0) {
          charges.billed = {
            amount: this.parseMoney(dollarMatches[0]),
            ocr: this.createMockOCR(artifactId, dollarMatches[0])
          };

          if (docType === 'EOB' && dollarMatches.length > 1) {
            charges.allowed = {
              amount: this.parseMoney(dollarMatches[1]),
              ocr: this.createMockOCR(artifactId, dollarMatches[1])
            };

            if (dollarMatches.length > 2) {
              charges.planPaid = {
                amount: this.parseMoney(dollarMatches[2]),
                ocr: this.createMockOCR(artifactId, dollarMatches[2])
              };
            }

            if (dollarMatches.length > 3) {
              charges.patientResp = {
                amount: this.parseMoney(dollarMatches[3]),
                ocr: this.createMockOCR(artifactId, dollarMatches[3])
              };
            }
          }
        }
        if (Object.keys(charges).length > 0) {
          item.charges = charges;
        }

        // Extract description (remove codes and amounts)
        let description = line.replace(/\b\d{5}\b|\b[A-Z]\d{4}\b|\$[\d,]+\.?\d{0,2}/g, '').trim();
        if (description && description.length > 3) {
          item.description = {
            text: description,
            ocr: this.createMockOCR(artifactId, description)
          };
        }

        // Extract modifiers
        const modifierMatch = line.match(/\b(\d{2}|[A-Z]{2})\b(?!\d)/g);
        if (modifierMatch) {
          item.modifiers = modifierMatch
            .filter(m => m !== code && !m.match(/^\d{5}$/)) // Exclude the main code
            .slice(0, 3)
            .map(mod => ({
              value: mod,
              ocr: this.createMockOCR(artifactId, mod)
            }));
        }

        // Extract units
        const unitMatch = line.match(/(?:units?|qty)\s*:?\s*(\d+)/i);
        if (unitMatch) {
          item.units = {
            value: parseInt(unitMatch[1]),
            ocr: this.createMockOCR(artifactId, unitMatch[0])
          };
        }

        lineItems.push(item);
      }
    }

    return lineItems;
  }

  private classifyDocumentType(buffer: Buffer, mimeType: string): 'EOB' | 'BILL' | 'LETTER' | 'PORTAL' | 'UNKNOWN' {
    const text = buffer.toString('utf8', 0, Math.min(3000, buffer.length)).toLowerCase();

    // EOB markers
    if (text.includes('explanation of benefits') ||
        text.includes('eob') ||
        text.includes('allowed amount') ||
        text.includes('plan paid') ||
        text.includes('patient responsibility')) {
      return 'EOB';
    }

    // Bill/statement markers
    if (text.includes('itemized') ||
        text.includes('statement') ||
        text.includes('account') ||
        text.includes('balance due') ||
        text.includes('charges')) {
      return 'BILL';
    }

    // Letter markers
    if (text.includes('dear') ||
        text.includes('sincerely') ||
        text.includes('denial') ||
        text.includes('appeal') ||
        text.includes('grievance')) {
      return 'LETTER';
    }

    // Portal/screenshot markers
    if (text.includes('portal') ||
        text.includes('login') ||
        text.includes('dashboard') ||
        text.includes('website')) {
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
      return Math.max(1, Math.floor(buffer.length / 50000));
    }
    return 1;
  }

  private async inferCaseContext(
    extractionResults: any,
    narrative: string
  ): Promise<UnifiedChatCase['inferred']> {
    const inferred: UnifiedChatCase['inferred'] = {};

    // Infer facility type from narrative and extracted data
    if (/emergency|ER|urgent/i.test(narrative)) {
      inferred.facility = 'ER';
      inferred.emergency = true;
    } else if (/hospital|inpatient/i.test(narrative)) {
      inferred.facility = 'HospitalOP';
    } else if (/surgery center|ASC/i.test(narrative)) {
      inferred.facility = 'ASC';
    } else if (/office|clinic/i.test(narrative)) {
      inferred.facility = 'Office';
    }

    // Check for NSA candidate scenarios
    if (/surprise.*bill|unexpected.*bill|out.*network|OON|balance.*bill/i.test(narrative)) {
      inferred.nsaCandidate = true;
    }

    // Identify ancillary vendors
    const ancillary: string[] = [];
    if (/anesthesia|anesthetist/i.test(narrative)) ancillary.push('anesthesia');
    if (/pathology|pathologist/i.test(narrative)) ancillary.push('pathology');
    if (/radiology|radiologist/i.test(narrative)) ancillary.push('radiology');
    if (/emergency medicine|ER doctor/i.test(narrative)) ancillary.push('emergency');

    if (ancillary.length > 0) {
      inferred.ancillary = ancillary;
    }

    return inferred;
  }

  private classifyThemes(narrative: string, themeHints?: string[]): string[] {
    const themes: string[] = [];
    const lowerNarrative = narrative.toLowerCase();

    // If user provided theme hints, use those first
    if (themeHints && themeHints.length > 0) {
      themes.push(...themeHints);
    }

    // Classify based on theme bank categories
    for (const category of this.themeBank.categories) {
      let matched = false;
      let highPriorityMatch = false;

      for (const question of category.questions) {
        const keywordMatches = question.keywords.some(keyword =>
          lowerNarrative.includes(keyword.toLowerCase())
        );

        if (keywordMatches) {
          if (!themes.includes(category.category)) {
            themes.push(category.category);
          }
          matched = true;
          if (question.priority === 'high') {
            highPriorityMatch = true;
          }
          break;
        }
      }

      if (matched && highPriorityMatch) {
        // High priority questions get boosted
        continue;
      }
    }

    // Fallback classifications based on common patterns
    if (themes.length === 0) {
      if (/eob|explanation|benefits/i.test(narrative)) {
        themes.push('Claims/Billing/EOB/Appeals');
      } else if (/bill|billing|charge|cost|pay/i.test(narrative)) {
        themes.push('Costs');
      } else if (/network|provider|doctor/i.test(narrative)) {
        themes.push('Networks & Access');
      } else {
        themes.push('Day-to-Day Use');
      }
    }

    return themes.slice(0, 3); // Limit to top 3 themes
  }

  private calculateConfidenceScores(extractionResults: any): {
    overallOCR: number;
    fieldExtraction: number;
    themeClassification: number;
  } {
    // Mock confidence calculation - in production, this would be based on actual OCR results
    return {
      overallOCR: 85,
      fieldExtraction: 80,
      themeClassification: 90
    };
  }

  // Helper methods
  private generateCaseId(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateArtifactId(): string {
    return `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private normalizeDate(dateStr: string): string {
    try {
      const date = new Date(dateStr.replace(/[\/\-]/g, '/'));
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {}
    return dateStr;
  }

  private parseMoney(moneyStr: string): MoneyCents {
    const cleanStr = moneyStr.replace(/[$,]/g, '');
    const amount = parseFloat(cleanStr);
    return isNaN(amount) ? 0 : Math.round(amount * 100);
  }

  private createMockOCR(artifactId: string, text: string): OCRFieldExtraction {
    return {
      artifactId,
      page: 1,
      bbox: [0, 0, 100, 20],
      conf: 0.85,
      text
    };
  }
}