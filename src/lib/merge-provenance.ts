import { LineItem, DocumentMeta } from '@/types/analyzer';
import { MoneyCents } from '@/types/common';

export interface ProvenanceInfo {
  page: number;
  bbox?: [number, number, number, number];
  confidence: number;
  extractionMethod: 'table-aware' | 'pattern-based' | 'kv-pair';
  sourceText: string;
}

export interface MergedDocument {
  primaryArtifact: DocumentMeta;
  pairedArtifacts: DocumentMeta[];
  lineItems: LineItem[];
  provenance: Map<string, ProvenanceInfo>;
  pairingMethod: 'claimId' | 'fuzzy' | 'unpaired';
  pairingConfidence: number;
}

export class MergeProvenanceTracker {
  /**
   * Merge and pair documents (Bill ↔ EOB)
   */
  public mergeDocuments(
    documents: DocumentMeta[],
    allLineItems: LineItem[]
  ): MergedDocument[] {
    console.log(`🔗 Merging ${documents.length} documents with ${allLineItems.length} line items`);

    if (documents.length === 1) {
      // Single document - no pairing needed
      return this.createSingleDocumentGroup(documents[0], allLineItems);
    }

    // Group documents by pairing
    const pairedGroups = this.pairDocuments(documents, allLineItems);

    return pairedGroups.map(group => this.createMergedDocument(group));
  }

  /**
   * Pair documents using multiple strategies
   */
  private pairDocuments(
    documents: DocumentMeta[],
    allLineItems: LineItem[]
  ): Array<{ primary: DocumentMeta; paired: DocumentMeta[]; lineItems: LineItem[] }> {
    const groups: Array<{ primary: DocumentMeta; paired: DocumentMeta[]; lineItems: LineItem[] }> = [];
    const processed = new Set<string>();

    for (const doc of documents) {
      if (processed.has(doc.artifactId)) continue;

      const group = {
        primary: doc,
        paired: [] as DocumentMeta[],
        lineItems: allLineItems.filter(item => item.artifactId === doc.artifactId)
      };

      // Try to find paired documents
      for (const otherDoc of documents) {
        if (otherDoc.artifactId === doc.artifactId || processed.has(otherDoc.artifactId)) {
          continue;
        }

        const pairingResult = this.calculatePairingScore(doc, otherDoc, allLineItems);

        if (pairingResult.canPair) {
          group.paired.push(otherDoc);
          group.lineItems.push(...allLineItems.filter(item => item.artifactId === otherDoc.artifactId));
          processed.add(otherDoc.artifactId);

          console.log(`🔗 Paired documents: ${doc.docType} ↔ ${otherDoc.docType} (method: ${pairingResult.method}, confidence: ${pairingResult.confidence})`);
        }
      }

      groups.push(group);
      processed.add(doc.artifactId);
    }

    return groups;
  }

  /**
   * Calculate pairing score between two documents
   */
  private calculatePairingScore(
    doc1: DocumentMeta,
    doc2: DocumentMeta,
    allLineItems: LineItem[]
  ): { canPair: boolean; method: string; confidence: number } {
    // Strategy 1: Claim ID match
    if (doc1.claimId && doc2.claimId && doc1.claimId === doc2.claimId) {
      return { canPair: true, method: 'claimId', confidence: 0.95 };
    }

    // Strategy 2: Fuzzy matching
    const fuzzyScore = this.calculateFuzzyMatchingScore(doc1, doc2, allLineItems);

    if (fuzzyScore >= 0.7) {
      return { canPair: true, method: 'fuzzy', confidence: fuzzyScore };
    }

    return { canPair: false, method: 'none', confidence: 0 };
  }

  /**
   * Calculate fuzzy matching score based on multiple factors
   */
  private calculateFuzzyMatchingScore(
    doc1: DocumentMeta,
    doc2: DocumentMeta,
    allLineItems: LineItem[]
  ): number {
    let score = 0;
    let factors = 0;

    // Factor 1: Service date proximity (±2 days)
    if (doc1.serviceDates?.start && doc2.serviceDates?.start) {
      const date1 = new Date(doc1.serviceDates.start);
      const date2 = new Date(doc2.serviceDates.start);
      const daysDiff = Math.abs((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff <= 2) {
        score += 0.4;
      } else if (daysDiff <= 7) {
        score += 0.2;
      }
      factors++;
    }

    // Factor 2: Provider match (NPI or TIN)
    if (doc1.providerNPI && doc2.providerNPI && doc1.providerNPI === doc2.providerNPI) {
      score += 0.3;
      factors++;
    } else if (doc1.providerTIN && doc2.providerTIN && doc1.providerTIN === doc2.providerTIN) {
      score += 0.25;
      factors++;
    }

    // Factor 3: Billed total proximity (±5%)
    const doc1Total = doc1.totals?.billed || 0;
    const doc2Total = doc2.totals?.billed || 0;

    if (doc1Total > 0 && doc2Total > 0) {
      const percentDiff = Math.abs(doc1Total - doc2Total) / Math.max(doc1Total, doc2Total);
      if (percentDiff <= 0.05) {
        score += 0.3;
      } else if (percentDiff <= 0.15) {
        score += 0.15;
      }
      factors++;
    }

    // Normalize score by number of factors
    return factors > 0 ? score / factors : 0;
  }

  /**
   * Create merged document with provenance tracking
   */
  private createMergedDocument(group: {
    primary: DocumentMeta;
    paired: DocumentMeta[];
    lineItems: LineItem[];
  }): MergedDocument {
    const provenance = new Map<string, ProvenanceInfo>();

    // Track provenance for each line item
    group.lineItems.forEach(item => {
      if (item.ocr) {
        provenance.set(item.lineId, {
          page: item.ocr.page,
          bbox: item.ocr.bbox,
          confidence: item.ocr.conf || 0.8,
          extractionMethod: 'table-aware',
          sourceText: item.description || ''
        });
      }
    });

    const pairingMethod = group.paired.length > 0 ?
      (group.primary.claimId && group.paired.some(p => p.claimId === group.primary.claimId) ? 'claimId' : 'fuzzy') :
      'unpaired';

    return {
      primaryArtifact: group.primary,
      pairedArtifacts: group.paired,
      lineItems: group.lineItems,
      provenance,
      pairingMethod,
      pairingConfidence: group.paired.length > 0 ? 0.8 : 1.0
    };
  }

  /**
   * Create single document group
   */
  private createSingleDocumentGroup(
    document: DocumentMeta,
    lineItems: LineItem[]
  ): MergedDocument[] {
    const relevantLineItems = lineItems.filter(item => item.artifactId === document.artifactId);
    const provenance = new Map<string, ProvenanceInfo>();

    relevantLineItems.forEach(item => {
      if (item.ocr) {
        provenance.set(item.lineId, {
          page: item.ocr.page,
          bbox: item.ocr.bbox,
          confidence: item.ocr.conf || 0.8,
          extractionMethod: 'table-aware',
          sourceText: item.description || ''
        });
      }
    });

    return [{
      primaryArtifact: document,
      pairedArtifacts: [],
      lineItems: relevantLineItems,
      provenance,
      pairingMethod: 'unpaired',
      pairingConfidence: 1.0
    }];
  }

  /**
   * Generate "Show proof" UI data for highlighting source regions
   */
  public generateProofHighlights(lineId: string, provenance: Map<string, ProvenanceInfo>): {
    page: number;
    bbox?: [number, number, number, number];
    confidence: number;
    sourceText: string;
  } | null {
    const proof = provenance.get(lineId);
    if (!proof) return null;

    return {
      page: proof.page,
      bbox: proof.bbox,
      confidence: proof.confidence,
      sourceText: proof.sourceText
    };
  }

  /**
   * Extract key facts for non-structured documents
   */
  public extractKeyFacts(docType: string, ocrText: string): string[] {
    const keyFacts: string[] = [];

    switch (docType) {
      case 'LETTER':
        keyFacts.push(...this.extractLetterKeyFacts(ocrText));
        break;
      case 'PORTAL':
        keyFacts.push(...this.extractPortalKeyFacts(ocrText));
        break;
      case 'INSURANCE_CARD':
        keyFacts.push(...this.extractCardKeyFacts(ocrText));
        break;
    }

    return keyFacts;
  }

  private extractLetterKeyFacts(text: string): string[] {
    const facts: string[] = [];

    // Denial reasons
    const denialPatterns = [
      /denied|rejection|not covered|excluded/gi,
      /medical necessity|experimental|investigational/gi,
      /out.of.network|non.participating/gi,
      /prior authorization|pre.authorization/gi
    ];

    denialPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        facts.push(`Denial reason: ${matches[0]}`);
      }
    });

    // CARC/RARC codes
    const carcMatches = text.match(/(?:CARC|RC)\s*(\d+)/gi);
    if (carcMatches) {
      facts.push(`CARC codes: ${carcMatches.join(', ')}`);
    }

    const rarcMatches = text.match(/(?:RARC|RMK)\s*([A-Z]\d+)/gi);
    if (rarcMatches) {
      facts.push(`RARC codes: ${rarcMatches.join(', ')}`);
    }

    // Account/claim references
    const claimMatch = text.match(/claim[:\s#]*([A-Z0-9\-]{6,20})/i);
    if (claimMatch) {
      facts.push(`Claim ID: ${claimMatch[1]}`);
    }

    return facts;
  }

  private extractPortalKeyFacts(text: string): string[] {
    const facts: string[] = [];

    // Portal-specific patterns
    const authMatch = text.match(/authorization[:\s#]*([A-Z0-9\-]{6,20})/i);
    if (authMatch) {
      facts.push(`Authorization: ${authMatch[1]}`);
    }

    const referralMatch = text.match(/referral[:\s#]*([A-Z0-9\-]{6,20})/i);
    if (referralMatch) {
      facts.push(`Referral: ${referralMatch[1]}`);
    }

    return facts;
  }

  private extractCardKeyFacts(text: string): string[] {
    const facts: string[] = [];

    // Insurance card patterns (with masking for privacy)
    const binMatch = text.match(/bin[:\s]*(\d{6})/i);
    if (binMatch) {
      facts.push(`BIN: ${binMatch[1]}`);
    }

    const pcnMatch = text.match(/pcn[:\s]*([A-Z0-9]{3,10})/i);
    if (pcnMatch) {
      facts.push(`PCN: ${pcnMatch[1]}`);
    }

    const grpMatch = text.match(/(?:group|grp)[:\s#]*([A-Z0-9\-]{3,15})/i);
    if (grpMatch) {
      facts.push(`Group: ${grpMatch[1]}`);
    }

    // Member ID (masked)
    const memberMatch = text.match(/(?:member|id)[:\s#]*([A-Z0-9\-]{5,20})/i);
    if (memberMatch) {
      const masked = memberMatch[1].substring(0, 3) + '***' + memberMatch[1].substring(memberMatch[1].length - 2);
      facts.push(`Member ID: ${masked}`);
    }

    return facts;
  }

  /**
   * Validate line item provenance
   */
  public validateProvenance(lineItem: LineItem, originalOCRTokens: any[]): boolean {
    if (!lineItem.ocr) return false;

    // Find tokens within the bbox
    const bbox = lineItem.ocr.bbox;
    if (!bbox) return true; // Can't validate without bbox

    const [x, y, width, height] = bbox;
    const matchingTokens = originalOCRTokens.filter(token => {
      const [tx, ty, tw, th] = token.bbox;
      return (
        tx >= x && ty >= y &&
        tx + tw <= x + width &&
        ty + th <= y + height
      );
    });

    // Check if extracted text matches tokens in the region
    const regionText = matchingTokens.map(t => t.text).join(' ').toLowerCase();
    const lineText = (lineItem.description || '').toLowerCase();

    return regionText.includes(lineText) || lineText.includes(regionText);
  }
}