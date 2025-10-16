/**
 * Savings estimation logic for detected billing issues
 */

import { Detection, PricedSummary, ParsedLine } from '@/lib/types/ocr';

/**
 * Calculate total savings from all detections, avoiding double counting
 */
export function calculateTotalSavings(
  detections: Detection[],
  summary: PricedSummary
): { savingsTotalCents: number; detections: Detection[] } {
  const allocatedLineIds = new Set<string>();
  let totalSavings = 0;

  const processedDetections = detections.map(detection => {
    const savings = calculateDetectionSavings(detection, summary, allocatedLineIds);

    // Mark line IDs as allocated to prevent double counting
    if (detection.evidence?.lineRefs) {
      detection.evidence.lineRefs.forEach(lineId => allocatedLineIds.add(lineId));
    }

    totalSavings += savings;

    return {
      ...detection,
      savingsCents: savings
    };
  });

  return {
    savingsTotalCents: totalSavings,
    detections: processedDetections
  };
}

/**
 * Calculate savings for a specific detection
 */
function calculateDetectionSavings(
  detection: Detection,
  summary: PricedSummary,
  allocatedLineIds: Set<string>
): number {
  // Skip if already has calculated savings
  if (detection.savingsCents !== undefined) {
    return detection.savingsCents;
  }

  // Get affected lines that haven't been allocated yet
  const affectedLines = getAffectedLines(detection, summary).filter(
    line => !allocatedLineIds.has(line.lineId)
  );

  if (affectedLines.length === 0) {
    return 0;
  }

  switch (detection.ruleKey) {
    case 'duplicate_lines':
      return calculateDuplicateLinesSavings(affectedLines);

    case 'unbundling_ncci':
      return calculateUnbundlingSavings(affectedLines);

    case 'facility_fee_surprise':
      return calculateFacilityFeeSavings(affectedLines);

    case 'jcode_units_sanity':
      return calculateJCodeUnitsSavings(affectedLines);

    case 'math_errors':
      return calculateMathErrorSavings(affectedLines);

    case 'prof_tech_split':
      return calculateProfTechSplitSavings(affectedLines);

    case 'modifier_misuse':
      return calculateModifierMisuseSavings(affectedLines);

    case 'preventive_vs_diagnostic':
      return calculatePreventiveDiagnosticSavings(affectedLines);

    default:
      // For other rules, estimate based on affected charges
      return estimateGenericSavings(affectedLines, detection.severity);
  }
}

/**
 * Get lines affected by a detection
 */
function getAffectedLines(detection: Detection, summary: PricedSummary): ParsedLine[] {
  if (!detection.evidence?.lineRefs) {
    return [];
  }

  return summary.lines.filter(line =>
    detection.evidence!.lineRefs!.includes(line.lineId)
  );
}

/**
 * Calculate savings for duplicate lines
 */
function calculateDuplicateLinesSavings(lines: ParsedLine[]): number {
  if (lines.length <= 1) return 0;

  // Keep the line with the lowest charge, refund the rest
  const charges = lines.map(line => line.charge || 0);
  const minCharge = Math.min(...charges);
  const totalCharges = charges.reduce((sum, charge) => sum + charge, 0);

  return totalCharges - minCharge;
}

/**
 * Calculate savings for NCCI unbundling
 */
function calculateUnbundlingSavings(lines: ParsedLine[]): number {
  // Component procedures should typically be removed when bundled
  // Keep the highest-value primary procedure, remove components

  const sortedByCharge = lines.sort((a, b) => (b.charge || 0) - (a.charge || 0));
  const primaryProcedure = sortedByCharge[0];
  const componentProcedures = sortedByCharge.slice(1);

  // Use allowed amount if available, otherwise charge
  return componentProcedures.reduce((sum, line) => {
    return sum + (line.allowed || line.charge || 0);
  }, 0);
}

/**
 * Calculate savings for facility fee surprise billing
 */
function calculateFacilityFeeSavings(lines: ParsedLine[]): number {
  // Estimate that facility fees can be reduced by 40-60% through negotiation
  const facilityFeeLines = lines.filter(line =>
    line.revCode && ['450', '451', '452', '459'].includes(line.revCode)
  );

  const totalFacilityFees = facilityFeeLines.reduce((sum, line) => {
    return sum + (line.charge || 0);
  }, 0);

  return Math.round(totalFacilityFees * 0.5); // 50% reduction estimate
}

/**
 * Calculate savings for J-code units issues
 */
function calculateJCodeUnitsSavings(lines: ParsedLine[]): number {
  let savings = 0;

  for (const line of lines) {
    if (!line.code?.startsWith('J') || !line.units || !line.charge) continue;

    // Estimate reasonable units based on common patterns
    const reasonableUnits = getReasonableJCodeUnits(line.code, line.units);

    if (reasonableUnits < line.units) {
      const unitPrice = line.charge / line.units;
      const excessUnits = line.units - reasonableUnits;
      savings += Math.round(excessUnits * unitPrice);
    }
  }

  return savings;
}

/**
 * Calculate savings for math errors
 */
function calculateMathErrorSavings(lines: ParsedLine[]): number {
  let savings = 0;

  for (const line of lines) {
    if (!line.allowed || !line.planPaid || !line.patientResp) continue;

    const correctPatientResp = line.allowed - line.planPaid;
    const actualPatientResp = line.patientResp;

    // If patient was overcharged
    if (actualPatientResp > correctPatientResp) {
      savings += actualPatientResp - correctPatientResp;
    }
  }

  return savings;
}

/**
 * Calculate savings for professional/technical component splits
 */
function calculateProfTechSplitSavings(lines: ParsedLine[]): number {
  // When services should be split, the total payment is often less
  // than billing global service incorrectly
  const totalCharges = lines.reduce((sum, line) => sum + (line.charge || 0), 0);

  // Estimate 15% savings when properly split
  return Math.round(totalCharges * 0.15);
}

/**
 * Calculate savings for modifier misuse
 */
function calculateModifierMisuseSavings(lines: ParsedLine[]): number {
  // Inappropriate modifiers often lead to denied claims or reduced payment
  const totalCharges = lines.reduce((sum, line) => sum + (line.charge || 0), 0);

  // Conservative estimate: 10% of charges
  return Math.round(totalCharges * 0.10);
}

/**
 * Calculate savings for preventive vs diagnostic coding issues
 */
function calculatePreventiveDiagnosticSavings(lines: ParsedLine[]): number {
  // Preventive services should typically have no patient cost-sharing
  const diagnosticLines = lines.filter(line =>
    line.code && /^99[2-3]\d{2}$/.test(line.code)
  );

  return diagnosticLines.reduce((sum, line) => {
    return sum + (line.patientResp || 0);
  }, 0);
}

/**
 * Generic savings estimation based on severity
 */
function estimateGenericSavings(lines: ParsedLine[], severity: string): number {
  const totalCharges = lines.reduce((sum, line) => sum + (line.charge || 0), 0);

  switch (severity) {
    case 'high':
      return Math.round(totalCharges * 0.20); // 20% of charges
    case 'warn':
      return Math.round(totalCharges * 0.10); // 10% of charges
    case 'info':
      return Math.round(totalCharges * 0.05); // 5% of charges
    default:
      return 0;
  }
}

/**
 * Estimate reasonable units for J-codes based on common patterns
 */
function getReasonableJCodeUnits(jCode: string, reportedUnits: number): number {
  // Common J-code unit patterns (this would be expanded with real data)
  const commonUnits: Record<string, number> = {
    'J1100': 10, // Dexamethasone - typically 10 units max
    'J2001': 5,  // Lidocaine - typically 5 units max
    'J3420': 1,  // Vitamin B12 - typically 1 unit
    'J7050': 20, // Normal saline - up to 20 units reasonable
  };

  const maxReasonable = commonUnits[jCode] || 50; // Default max 50 units

  // If reported units are way above reasonable, suggest the reasonable max
  if (reportedUnits > maxReasonable * 2) {
    return maxReasonable;
  }

  // If slightly above, suggest 75% of reported
  if (reportedUnits > maxReasonable) {
    return Math.round(reportedUnits * 0.75);
  }

  return reportedUnits;
}

/**
 * Calculate potential savings summary statistics
 */
export function getSavingsSummary(detections: Detection[]): {
  totalSavings: number;
  highSeveritySavings: number;
  warnSeveritySavings: number;
  infoSeveritySavings: number;
  topSavingsRules: { ruleKey: string; savings: number; count: number }[];
} {
  const summary = {
    totalSavings: 0,
    highSeveritySavings: 0,
    warnSeveritySavings: 0,
    infoSeveritySavings: 0,
    topSavingsRules: [] as { ruleKey: string; savings: number; count: number }[]
  };

  const rulesSavings = new Map<string, { savings: number; count: number }>();

  for (const detection of detections) {
    const savings = detection.savingsCents || 0;
    summary.totalSavings += savings;

    // Track by severity
    switch (detection.severity) {
      case 'high':
        summary.highSeveritySavings += savings;
        break;
      case 'warn':
        summary.warnSeveritySavings += savings;
        break;
      case 'info':
        summary.infoSeveritySavings += savings;
        break;
    }

    // Track by rule
    const current = rulesSavings.get(detection.ruleKey) || { savings: 0, count: 0 };
    rulesSavings.set(detection.ruleKey, {
      savings: current.savings + savings,
      count: current.count + 1
    });
  }

  // Sort rules by savings amount
  summary.topSavingsRules = Array.from(rulesSavings.entries())
    .map(([ruleKey, data]) => ({ ruleKey, ...data }))
    .sort((a, b) => b.savings - a.savings);

  return summary;
}