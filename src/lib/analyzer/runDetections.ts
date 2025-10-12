import type { PricedSummary } from "../ocr/parseBill";
import { NoBenefitsDetectionEngine } from "../detect/engine";
import type { DetectionContext, DetectionResult } from "../detect/types";
import type { LineItem } from "@/types/analyzer";

// Detection interface compatible with the requirements spec
export interface Detection {
  ruleKey: string;
  severity: "info" | "warn" | "high";
  explanation: string;
  evidence?: {
    lineRefs?: string[];
    pageRefs?: number[];
  };
  citations?: {
    title: string;
    authority: "Federal" | "CMS" | "StateDOI" | "PayerPolicy";
    citation: string;
  }[];
}

// Convert our internal detection results to the external Detection format
function mapDetectionResult(result: DetectionResult): Detection | null {
  if (!result.triggered) {
    return null;
  }

  // Map severity levels
  const severityMap = {
    'HIGH': 'high' as const,
    'MEDIUM': 'warn' as const,
    'LOW': 'info' as const
  };

  // Get rule info from the engine to determine severity
  const engine = new NoBenefitsDetectionEngine();
  const rule = engine.getAvailableRules().find(r => r.id === result.ruleId);
  const severity = rule ? severityMap[rule.severity] : 'info';

  return {
    ruleKey: result.ruleId,
    severity,
    explanation: result.message,
    evidence: {
      lineRefs: result.affectedItems,
      pageRefs: result.evidence.map(e => parseInt(e.location)).filter(n => !isNaN(n))
    },
    citations: result.citations?.map(c => ({
      title: c.title,
      authority: c.authority as "Federal" | "CMS" | "StateDOI" | "PayerPolicy",
      citation: c.citation
    }))
  };
}

// Convert PricedSummary to DetectionContext for the existing 18-rule engine
function createDetectionContext(summary: PricedSummary): DetectionContext {
  console.log(`🔍 Creating detection context from priced summary with ${summary.lines.length} lines`);

  // Convert PricedLines to LineItems expected by detection engine
  const lineItems: LineItem[] = summary.lines.map((line, index) => ({
    lineId: line.lineId || `line_${index}`,
    artifactId: 'ocr_processed', // We don't have artifact ID at this level
    description: line.description,
    code: line.code,
    modifiers: undefined, // TODO: parse modifiers from line
    units: line.units,
    revCode: line.revCode,
    pos: line.pos,
    npi: line.npi,
    dos: line.dos,
    charge: line.charge,
    allowed: line.allowed,
    planPaid: line.planPaid,
    patientResp: line.patientResp,
    ocr: {
      page: 1, // Default to page 1 for OCR results
      conf: 0.9 // Default Google Vision confidence
    }
  }));

  const context: DetectionContext = {
    lineItems,
    totals: {
      charges: summary.totals.billed || 0,
      adjustments: 0, // Not available in PricedSummary
      payments: summary.totals.planPaid || 0,
      balance: (summary.totals.billed || 0) - (summary.totals.planPaid || 0)
    },
    dates: {
      serviceDate: summary.header.serviceDates?.start,
      billingDate: undefined, // Not available
      dueDate: undefined // Not available
    },
    provider: {
      npi: summary.header.NPI,
      name: summary.header.providerName,
      specialty: undefined // Not available
    },
    patient: {
      id: summary.header.accountId,
      name: undefined // Not available in our data
    },
    metadata: {
      docType: 'BILL', // Assume bill for now
      confidence: 0.9 // Default confidence from Vision API
    }
  };

  console.log(`✅ Detection context created with ${lineItems.length} line items`);
  return context;
}

export async function runDetections(summary: PricedSummary): Promise<Detection[]> {
  console.log(`🚀 Running 18-rule detection engine on priced summary...`);

  try {
    // Create detection context from the priced summary
    const context = createDetectionContext(summary);

    // Initialize the existing detection engine
    const engine = new NoBenefitsDetectionEngine();

    // Run all detections
    const results = await engine.runAllDetections(context);

    // Convert results to the expected Detection format and filter triggered ones
    const detections = results
      .map(mapDetectionResult)
      .filter((d): d is Detection => d !== null);

    console.log(`📊 Detection results: ${detections.length} issues detected out of ${results.length} rules run`);

    // Log summary of detections by severity
    const severityCounts = detections.reduce((acc, d) => {
      acc[d.severity] = (acc[d.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`🎯 Detection summary:`, severityCounts);

    return detections;

  } catch (error) {
    console.error(`❌ Detection engine failed:`, error);

    // Return empty array on failure to not break the OCR pipeline
    return [];
  }
}