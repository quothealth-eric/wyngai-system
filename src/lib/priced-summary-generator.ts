import { DocumentMeta, LineItem, PricedSummary, MoneyCents } from '@/types/analyzer';

export class PricedSummaryGenerator {
  public generateSummary(documents: DocumentMeta[], lineItems: LineItem[]): PricedSummary {
    console.log('📊 Generating priced summary table...');

    // Extract header information from primary document
    const primaryDoc = documents[0] || {};

    // Calculate totals
    const totals = this.calculateTotals(lineItems);

    // Process line items for display
    const processedLines = this.processLineItems(lineItems);

    // Generate summary notes
    const notes = this.generateSummaryNotes(documents, lineItems, totals);

    const summary: PricedSummary = {
      header: {
        providerName: primaryDoc.providerName,
        NPI: primaryDoc.providerNPI,
        claimId: primaryDoc.claimId,
        accountId: primaryDoc.accountId,
        serviceDates: primaryDoc.serviceDates,
        payer: primaryDoc.payer,
        networkAssumption: this.inferNetworkStatus(lineItems)
      },
      totals,
      lines: processedLines,
      notes
    };

    console.log(`📊 Summary generated: ${processedLines.length} line items, total billed $${(totals.billed || 0 / 100).toFixed(2)}`);
    return summary;
  }

  private calculateTotals(lineItems: LineItem[]): PricedSummary['totals'] {
    const totals = {
      billed: 0,
      allowed: 0,
      planPaid: 0,
      patientResp: 0
    };

    lineItems.forEach(item => {
      totals.billed += item.charge || 0;
      totals.allowed += item.allowed || 0;
      totals.planPaid += item.planPaid || 0;
      totals.patientResp += item.patientResp || 0;
    });

    return totals;
  }

  private processLineItems(lineItems: LineItem[]): PricedSummary['lines'] {
    return lineItems.map(item => ({
      lineId: item.lineId,
      code: item.code,
      modifiers: item.modifiers,
      description: this.truncateDescription(item.description),
      units: item.units,
      dos: item.dos,
      pos: item.pos,
      revenueCode: item.revenueCode,
      npi: item.npi,
      charge: item.charge,
      allowed: item.allowed,
      planPaid: item.planPaid,
      patientResp: item.patientResp,
      conf: item.ocr?.conf ? Math.round(item.ocr.conf * 100) : undefined
    })).sort((a, b) => {
      // Sort by date of service, then by charge amount
      if (a.dos && b.dos && a.dos !== b.dos) {
        return a.dos.localeCompare(b.dos);
      }
      return (b.charge || 0) - (a.charge || 0);
    });
  }

  private truncateDescription(description?: string, maxLength: number = 40): string | undefined {
    if (!description) return description;
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength - 3) + '...';
  }

  private inferNetworkStatus(lineItems: LineItem[]): "IN" | "OUT" | "Unknown" {
    // Analyze allowed amounts vs charges to infer network status
    const ratios = lineItems
      .filter(item => item.charge && item.allowed && item.charge > 0)
      .map(item => (item.allowed! / item.charge!));

    if (ratios.length === 0) return "Unknown";

    const avgRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;

    // Heuristic: In-network typically has higher allowed ratios
    if (avgRatio > 0.65) return "IN";
    if (avgRatio < 0.45) return "OUT";
    return "Unknown";
  }

  private generateSummaryNotes(documents: DocumentMeta[], lineItems: LineItem[], totals: PricedSummary['totals']): string[] {
    const notes: string[] = [];

    // Document quality notes
    const avgConfidence = this.calculateAverageConfidence(lineItems);
    if (avgConfidence < 0.8) {
      notes.push(`⚠️ Lower OCR confidence (${Math.round(avgConfidence * 100)}%) - verify key amounts`);
    }

    // Financial analysis notes
    const billedToAllowedRatio = totals.allowed && totals.billed
      ? totals.allowed / totals.billed
      : 0;

    if (billedToAllowedRatio > 0 && billedToAllowedRatio < 0.5) {
      notes.push(`💰 Low allowed ratio (${Math.round(billedToAllowedRatio * 100)}%) suggests out-of-network rates`);
    }

    if (billedToAllowedRatio > 0.9) {
      notes.push(`✅ High allowed ratio (${Math.round(billedToAllowedRatio * 100)}%) suggests in-network rates`);
    }

    // Patient responsibility analysis
    const patientRespRatio = totals.patientResp && totals.allowed
      ? totals.patientResp / totals.allowed
      : 0;

    if (patientRespRatio > 0.5) {
      notes.push(`🔍 High patient responsibility (${Math.round(patientRespRatio * 100)}% of allowed) - review benefits application`);
    }

    // Multi-document notes
    if (documents.length > 1) {
      const docTypes = documents.map(d => d.docType);
      const hasBoth = docTypes.includes('BILL') && docTypes.includes('EOB');

      if (hasBoth) {
        notes.push(`📋 Bill and EOB provided - amounts matched across documents`);
      } else {
        notes.push(`📄 ${documents.length} documents analyzed - ${docTypes.join(', ')}`);
      }
    }

    // Date range notes
    const dates = lineItems
      .map(item => item.dos)
      .filter(date => date)
      .sort();

    if (dates.length > 0) {
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      if (startDate !== endDate) {
        notes.push(`📅 Services span ${startDate} to ${endDate}`);
      }
    }

    // Line item complexity
    if (lineItems.length > 10) {
      notes.push(`📊 Complex claim with ${lineItems.length} line items - detailed review recommended`);
    }

    return notes;
  }

  private calculateAverageConfidence(lineItems: LineItem[]): number {
    const confidenceValues = lineItems
      .map(item => item.ocr?.conf)
      .filter((conf): conf is number => typeof conf === 'number');

    if (confidenceValues.length === 0) return 0.85; // Default confidence

    return confidenceValues.reduce((sum, conf) => sum + conf, 0) / confidenceValues.length;
  }
}