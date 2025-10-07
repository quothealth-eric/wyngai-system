import { OCRResult, ExtractedLineItem, CaseDocument, MergedCase } from '@/types/qakb';
import { UnifiedChatCase, DocumentArtifact, ExtractedDocumentHeader, ExtractedDocumentTotals } from '@/types/chat';

interface OCRFieldMatch {
  value: string;
  confidence: number;
  rawText?: string;
}

interface LineItemExtraction {
  lineId: string;
  code?: OCRFieldMatch;
  modifiers?: string[];
  description?: OCRFieldMatch;
  units?: OCRFieldMatch;
  charges?: {
    billed?: OCRFieldMatch;
    allowed?: OCRFieldMatch;
    planPaid?: OCRFieldMatch;
    patientResp?: OCRFieldMatch;
  };
  dos?: OCRFieldMatch;
  pos?: OCRFieldMatch;
  npi?: OCRFieldMatch;
  denialCodes?: Array<{
    code: string;
    type: "CARC" | "RARC" | "Other";
    description?: string;
    confidence: number;
  }>;
  confidence: number;
}

export class OCRProcessor {

  // Simulate OCR processing for documents
  async processDocument(artifact: DocumentArtifact): Promise<OCRResult> {
    // In a real implementation, this would call actual OCR services
    // For now, we'll simulate based on document type

    const baseConfidence = 0.85;
    let simulatedText = '';
    let documentType: OCRResult['metadata']['documentType'] = 'unknown';

    switch (artifact.docType) {
      case 'EOB':
        documentType = 'eob';
        simulatedText = this.simulateEOBText(artifact);
        break;
      case 'BILL':
        documentType = 'medical_bill';
        simulatedText = this.simulateBillText(artifact);
        break;
      default:
        simulatedText = `Document content for ${artifact.filename}`;
    }

    return {
      text: simulatedText,
      confidence: baseConfidence,
      metadata: {
        documentType,
        extractedFields: this.extractBasicFields(simulatedText),
        processingTime: Math.random() * 2000 + 500 // 500-2500ms
      }
    };
  }

  private simulateEOBText(artifact: DocumentArtifact): string {
    return `EXPLANATION OF BENEFITS

Member: JOHN DOE
Policy Number: ABC123456789
Claim Number: CL202401001
Date of Service: 01/15/2024
Provider: CENTRAL MEDICAL CENTER
NPI: 1234567890

Service Description              CPT    Billed    Allowed   Plan Paid  You Owe
Office Visit Level 4            99214    $250.00   $180.00   $144.00    $36.00
Laboratory Work                 80053    $85.00    $65.00    $52.00     $13.00
X-Ray Chest                     71020    $120.00   $90.00    $72.00     $18.00

TOTALS                                   $455.00   $335.00   $268.00    $67.00

Deductible Applied: $0.00
Coinsurance: 20%
Out-of-Pocket This Year: $1,245.00

Appeal Rights: If you disagree with this determination, you have the right to appeal.
Appeal Deadline: 180 days from the date of this notice.
`;
  }

  private simulateBillText(artifact: DocumentArtifact): string {
    return `MEDICAL BILL - CENTRAL MEDICAL CENTER

Patient: JOHN DOE
Account Number: ACC789012
Date of Service: 01/15/2024
Provider NPI: 1234567890

Services Provided:
- Office Visit Comprehensive      $250.00
- Lab Tests Complete Panel        $85.00
- Chest X-Ray                     $120.00

Subtotal:                         $455.00
Insurance Payment:                -$268.00
Patient Responsibility:           $187.00

Previous Balance:                 $0.00
AMOUNT DUE:                       $187.00

Payment Due Date: 02/15/2024
`;
  }

  private extractBasicFields(text: string): OCRResult['metadata']['extractedFields'] {
    const fields: OCRResult['metadata']['extractedFields'] = {};

    // Extract patient name
    const nameMatch = text.match(/(?:Member|Patient):\s*([A-Z\s]+)/);
    if (nameMatch) fields.patientName = nameMatch[1].trim();

    // Extract policy/account number
    const policyMatch = text.match(/(?:Policy|Account)\s+Number:\s*([A-Z0-9]+)/);
    if (policyMatch) fields.policyNumber = policyMatch[1];

    // Extract claim number
    const claimMatch = text.match(/Claim\s+Number:\s*([A-Z0-9]+)/);
    if (claimMatch) fields.claimNumber = claimMatch[1];

    // Extract date of service
    const dosMatch = text.match(/Date\s+of\s+Service:\s*(\d{2}\/\d{2}\/\d{4})/);
    if (dosMatch) fields.dateOfService = dosMatch[1];

    // Extract provider name
    const providerMatch = text.match(/Provider:\s*([A-Z\s]+)/);
    if (providerMatch) fields.providerName = providerMatch[1].trim();

    // Extract balance due
    const balanceMatch = text.match(/(?:AMOUNT\s+DUE|You\s+Owe):\s*\$?([\d,]+\.?\d*)/);
    if (balanceMatch) {
      fields.balanceDue = parseFloat(balanceMatch[1].replace(/,/g, ''));
    }

    return fields;
  }

  // Extract line items from OCR text
  extractLineItems(ocrText: string, artifactId: string): ExtractedLineItem[] {
    const lineItems: ExtractedLineItem[] = [];

    // Look for tabular data patterns
    const lines = ocrText.split('\n');
    let inServiceSection = false;
    let lineCounter = 1;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) continue;

      // Detect service section start
      if (trimmedLine.includes('Service Description') ||
          trimmedLine.includes('Services Provided') ||
          trimmedLine.includes('CPT')) {
        inServiceSection = true;
        continue;
      }

      // Detect section end
      if (trimmedLine.includes('TOTALS') ||
          trimmedLine.includes('Subtotal') ||
          trimmedLine.includes('AMOUNT DUE')) {
        inServiceSection = false;
        continue;
      }

      if (inServiceSection) {
        const lineItem = this.parseLineItem(trimmedLine, `${artifactId}-line-${lineCounter++}`);
        if (lineItem) {
          lineItems.push(lineItem);
        }
      }
    }

    return lineItems;
  }

  private parseLineItem(lineText: string, lineId: string): ExtractedLineItem | null {
    // Simple pattern matching for line items
    // Real implementation would use more sophisticated parsing

    const patterns = {
      withCPT: /^(.+?)\s+(\d{5})\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)$/,
      withoutCPT: /^(.+?)\s+\$?([\d,]+\.?\d*)(?:\s+\$?([\d,]+\.?\d*))?(?:\s+\$?([\d,]+\.?\d*))?(?:\s+\$?([\d,]+\.?\d*))?$/
    };

    let match = lineText.match(patterns.withCPT);

    if (match) {
      return {
        lineId,
        code: {
          value: match[2],
          system: this.determineCodingSystem(match[2]),
          confidence: 0.9
        },
        description: match[1].trim(),
        charges: {
          billed: parseFloat(match[3].replace(/,/g, '')) * 100, // Convert to cents
          allowed: parseFloat(match[4].replace(/,/g, '')) * 100,
          planPaid: parseFloat(match[5].replace(/,/g, '')) * 100,
          patientResp: parseFloat(match[6].replace(/,/g, '')) * 100
        },
        confidence: 0.85
      };
    }

    // Try pattern without CPT code
    match = lineText.match(patterns.withoutCPT);
    if (match) {
      const charges: any = {};
      if (match[2]) charges.billed = parseFloat(match[2].replace(/,/g, '')) * 100;
      if (match[3]) charges.allowed = parseFloat(match[3].replace(/,/g, '')) * 100;
      if (match[4]) charges.planPaid = parseFloat(match[4].replace(/,/g, '')) * 100;
      if (match[5]) charges.patientResp = parseFloat(match[5].replace(/,/g, '')) * 100;

      return {
        lineId,
        description: match[1].trim(),
        charges: Object.keys(charges).length > 0 ? charges : undefined,
        confidence: 0.75
      };
    }

    return null;
  }

  private determineCodingSystem(code: string): "CPT" | "HCPCS" | "REV" | "Other" {
    if (/^\d{5}$/.test(code)) {
      // Standard 5-digit codes could be CPT or HCPCS
      const cptRanges = [
        [10000, 19999], [20000, 29999], [30000, 39999], [40000, 49999],
        [50000, 59999], [60000, 69999], [70000, 79999], [80000, 89999],
        [90000, 99999]
      ];

      const codeNum = parseInt(code);
      const isCPT = cptRanges.some(([start, end]) => codeNum >= start && codeNum <= end);

      return isCPT ? "CPT" : "HCPCS";
    }

    if (/^\d{3,4}$/.test(code)) {
      return "REV"; // Revenue codes are 3-4 digits
    }

    return "Other";
  }

  // Merge multiple case documents into a single case
  async mergeCaseDocuments(
    caseId: string,
    narrative: string,
    artifacts: DocumentArtifact[],
    extractedHeaders: Map<string, ExtractedDocumentHeader>,
    extractedTotals: Map<string, ExtractedDocumentTotals>,
    extractedLineItems: Map<string, ExtractedLineItem[]>
  ): Promise<MergedCase> {

    const documents: CaseDocument[] = [];

    // Process each artifact
    for (const artifact of artifacts) {
      const ocrResult = await this.processDocument(artifact);
      const lineItems = this.extractLineItems(ocrResult.text, artifact.artifactId);

      const document: CaseDocument = {
        artifactId: artifact.artifactId,
        filename: artifact.filename,
        docType: artifact.docType,
        pages: artifact.pages,
        ocrText: ocrResult.text,
        ocrConf: ocrResult.confidence,
        lineItems,
        totals: this.calculateDocumentTotals(lineItems),
        header: this.extractDocumentHeader(ocrResult.text, artifact.artifactId)
      };

      documents.push(document);
    }

    // Merge and consolidate
    const consolidatedTotals = this.consolidateTotals(documents);
    const matchedLineItems = this.deduplicateLineItems(documents);
    const inferred = this.inferCaseContext(documents, narrative);

    return {
      caseId,
      narrative,
      documents,
      matchedLineItems,
      consolidatedTotals,
      inferred
    };
  }

  private calculateDocumentTotals(lineItems: ExtractedLineItem[]): CaseDocument['totals'] {
    let billed = 0, allowed = 0, planPaid = 0, patientResp = 0;

    for (const item of lineItems) {
      if (item.charges) {
        if (item.charges.billed) billed += item.charges.billed;
        if (item.charges.allowed) allowed += item.charges.allowed;
        if (item.charges.planPaid) planPaid += item.charges.planPaid;
        if (item.charges.patientResp) patientResp += item.charges.patientResp;
      }
    }

    return billed > 0 ? { billed, allowed, planPaid, patientResp } : undefined;
  }

  private extractDocumentHeader(ocrText: string, artifactId: string): CaseDocument['header'] {
    const fields = this.extractBasicFields(ocrText);

    return {
      providerName: fields.providerName,
      claimId: fields.claimNumber,
      accountId: fields.policyNumber,
      serviceDates: fields.dateOfService ? {
        start: fields.dateOfService
      } : undefined
    };
  }

  private consolidateTotals(documents: CaseDocument[]): MergedCase['consolidatedTotals'] {
    let billed = 0, allowed = 0, planPaid = 0, patientResp = 0;

    for (const doc of documents) {
      if (doc.totals) {
        billed += doc.totals.billed || 0;
        allowed += doc.totals.allowed || 0;
        planPaid += doc.totals.planPaid || 0;
        patientResp += doc.totals.patientResp || 0;
      }
    }

    return { billed, allowed, planPaid, patientResp };
  }

  private deduplicateLineItems(documents: CaseDocument[]): ExtractedLineItem[] {
    const allLineItems: ExtractedLineItem[] = [];
    const seen = new Set<string>();

    for (const doc of documents) {
      for (const item of doc.lineItems) {
        // Create a signature for deduplication
        const signature = `${item.code?.value || 'no-code'}-${item.description || 'no-desc'}-${item.charges?.billed || 0}`;

        if (!seen.has(signature)) {
          seen.add(signature);
          allLineItems.push(item);
        }
      }
    }

    return allLineItems;
  }

  private inferCaseContext(documents: CaseDocument[], narrative: string): MergedCase['inferred'] {
    const narrativeLower = narrative.toLowerCase();
    const allText = documents.map(d => d.ocrText).join(' ').toLowerCase();

    // Infer facility type
    let facility: MergedCase['inferred']['facility'] = 'Unknown';
    if (allText.includes('emergency') || narrativeLower.includes('emergency')) {
      facility = 'ER';
    } else if (allText.includes('hospital') || narrativeLower.includes('hospital')) {
      facility = 'HospitalOP';
    } else if (allText.includes('surgery center') || allText.includes('asc')) {
      facility = 'ASC';
    } else if (allText.includes('office') || narrativeLower.includes('doctor office')) {
      facility = 'Office';
    }

    // Infer emergency status
    const emergency = narrativeLower.includes('emergency') ||
                     narrativeLower.includes('er ') ||
                     allText.includes('emergency');

    // Infer NSA candidate
    const nsaCandidate = emergency ||
                        narrativeLower.includes('surprise') ||
                        narrativeLower.includes('balance bill') ||
                        narrativeLower.includes('out of network');

    // Infer themes
    const themes: string[] = [];
    if (emergency) themes.push('Emergency Care');
    if (nsaCandidate) themes.push('OON/Balance Billing');
    if (documents.length > 1) themes.push('Claims/Billing/EOB/Appeals');
    if (narrativeLower.includes('denied') || narrativeLower.includes('appeal')) {
      themes.push('Claims/Billing/EOB/Appeals');
    }

    return {
      facility,
      emergency,
      nsaCandidate,
      themes
    };
  }
}