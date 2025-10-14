import { Detection, DocumentStructure, LineItem } from '@/types/analyzer';
import { DetectionEngine } from '@/lib/detection-engine';

// PricedSummary interface (simplified version since original was in deleted OCR files)
export interface PricedSummary {
  header: {
    providerName?: string;
    NPI?: string;
    claimId?: string;
    accountId?: string;
    serviceDates?: { start: string; end?: string };
    payer?: string;
  };
  totals: {
    billed?: number;
    allowed?: number;
    planPaid?: number;
    patientResp?: number;
  };
  lines: Array<{
    code: string;
    system: 'CPT' | 'HCPCS' | 'ICD10' | 'DRG';
    description?: string;
    modifiers?: string[];
    units?: number;
    charge?: number;
    allowed?: number;
    planPaid?: number;
    patientResp?: number;
    page?: number;
    rowIdx?: number;
  }>;
}

/**
 * Convert PricedSummary to DocumentStructure format expected by DetectionEngine
 */
function convertToDocumentStructure(pricedSummary: PricedSummary): DocumentStructure {
  const lineItems: LineItem[] = pricedSummary.lines.map((line, index) => ({
    id: `line_${index}`,
    lineId: `line_${index}`,
    artifactId: 'priced_summary',
    code: line.code,
    system: line.system,
    description: line.description || '',
    modifiers: line.modifiers || [],
    units: line.units || 1,
    charges: {
      billed: line.charge || 0,
      allowed: line.allowed || 0,
      planPaid: line.planPaid || 0,
      patientResp: line.patientResp || 0
    },
    metadata: {
      page: line.page || 1,
      rowIndex: line.rowIdx || index
    }
  }));

  const documentStructure: DocumentStructure = {
    header: {
      providerInfo: `${pricedSummary.header.providerName || 'Unknown'} (NPI: ${pricedSummary.header.NPI || 'N/A'})`,
      claimInfo: `Claim: ${pricedSummary.header.claimId || 'N/A'}, Account: ${pricedSummary.header.accountId || 'N/A'}`,
      payerInfo: pricedSummary.header.payer || 'Unknown Payer',
      serviceDates: pricedSummary.header.serviceDates ? `${pricedSummary.header.serviceDates.start} to ${pricedSummary.header.serviceDates.end || pricedSummary.header.serviceDates.start}` : 'Not specified'
    },
    totals: {
      billed: pricedSummary.totals.billed || 0,
      allowed: pricedSummary.totals.allowed || 0,
      planPaid: pricedSummary.totals.planPaid || 0,
      patientResp: pricedSummary.totals.patientResp || 0
    },
    lineItems,
    remarkCodes: []
  };

  return documentStructure;
}

/**
 * Run detection rules on a priced summary
 */
export async function runDetections(pricedSummary: PricedSummary): Promise<Detection[]> {
  try {
    console.log('🔍 Converting PricedSummary to DocumentStructure...');

    const documentStructure = convertToDocumentStructure(pricedSummary);

    console.log(`📊 Running detection engine on ${documentStructure.lineItems.length} line items...`);

    const detectionEngine = new DetectionEngine();
    const detections = detectionEngine.runDetections(documentStructure);

    console.log(`✅ Detection complete: ${detections.length} issues found`);

    return detections;
  } catch (error) {
    console.error('❌ Detection engine failed:', error);
    throw new Error(`Detection analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}