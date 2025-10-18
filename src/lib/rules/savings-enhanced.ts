/**
 * Enhanced savings computation with allowed-basis hierarchy
 * Priority: EOB allowed-basis → Plan inputs → Charge-basis fallback
 */

import { Detection, PricedSummary, ParsedLine, EOBSummary, InsurancePlan } from '@/lib/types/ocr';
import { EnhancedLineMatch, matchBillToEOBEnhanced } from '@/lib/matching/enhanced-line-matcher';

export interface SavingsComputationResult {
  detections: Detection[];
  savingsTotalCents: number;
  basis: 'allowed' | 'plan' | 'charge';
  lineMatches: EnhancedLineMatch[];
  impactedLines: Set<string>;
  eobRefs?: string[]; // References to EOB pages for citations
}

/**
 * Enhanced savings computation with hierarchical basis
 */
export function computeEnhancedSavings(
  detections: Detection[],
  pricedSummary: PricedSummary,
  eobSummary?: EOBSummary,
  insurancePlan?: InsurancePlan
): SavingsComputationResult {
  console.log('💰 Computing enhanced savings with hierarchical basis...');

  // Use enhanced line matching
  const matchingResult = matchBillToEOBEnhanced(
    pricedSummary.lines,
    eobSummary?.lines || [],
    insurancePlan
  );

  const impactedLines = new Set<string>();

  console.log(`📊 Using ${matchingResult.savingsBasis}-basis with ${matchingResult.stats.matchRate * 100}% match rate`);

  // Apply enhanced savings computation to each detection
  const enhancedDetections = detections.map(detection =>
    computeDetectionSavings(detection, pricedSummary, matchingResult.matches, insurancePlan, matchingResult.savingsBasis, impactedLines)
  );

  // Calculate total savings (avoid double counting)
  const savingsTotalCents = enhancedDetections.reduce((total, detection) =>
    total + (detection.savingsCents || 0), 0
  );

  // Generate EOB references if available
  const eobRefs = eobSummary ? generateEOBReferences(eobSummary) : undefined;

  console.log(`✅ Enhanced savings computation complete: $${(savingsTotalCents / 100).toFixed(2)} (${matchingResult.savingsBasis}-basis)`);

  return {
    detections: enhancedDetections,
    savingsTotalCents,
    basis: matchingResult.savingsBasis,
    lineMatches: matchingResult.matches,
    impactedLines,
    eobRefs
  };
}

/**
 * Generate EOB page references for citations
 */
function generateEOBReferences(eobSummary: EOBSummary): string[] {
  const refs: string[] = [];

  // Reference EOB pages containing claim totals and balances
  if (eobSummary.header.totalBilled || eobSummary.header.totalAllowed) {
    refs.push('EOB p1 (claim totals and balances)');
  }

  // Reference line detail pages (assuming lines span multiple pages)
  const pages = [...new Set(eobSummary.lines.map(line => line.page))];
  if (pages.length > 1) {
    const pageRange = `p${Math.min(...pages)}-${Math.max(...pages)}`;
    refs.push(`EOB ${pageRange} (line details)`);
  } else if (pages.length === 1) {
    refs.push(`EOB p${pages[0]} (line details)`);
  }

  return refs;
}

/**
 * Calculate member-specific impact based on EOB data
 */
export function calculateMemberImpact(
  savingsResult: SavingsComputationResult,
  eobSummary?: EOBSummary
): {
  memberOwes: number
  potentialRefund: number
  oopMet: boolean
  impactMessage: string
} {
  const totalSavings = savingsResult.savingsTotalCents

  if (!eobSummary) {
    return {
      memberOwes: 0,
      potentialRefund: totalSavings,
      oopMet: false,
      impactMessage: 'Savings will reduce member financial responsibility.'
    }
  }

  const totalPatientResp = eobSummary.header.totalPatientResp || 0
  const memberOwes = Math.max(totalPatientResp - totalSavings, 0)

  // Determine if this could result in a refund
  const potentialRefund = totalSavings > totalPatientResp ? totalSavings - totalPatientResp : 0

  // Simple heuristic for OOP met (would need more sophisticated logic)
  const oopMet = totalPatientResp === 0 && !!eobSummary.header.totalPlanPaid && eobSummary.header.totalPlanPaid > 0

  let impactMessage = ''
  if (potentialRefund > 0) {
    impactMessage = `Savings will result in member refund of $${(potentialRefund / 100).toFixed(2)}.`
  } else if (oopMet) {
    impactMessage = 'OOP maximum appears met - savings will refund member because plan pays 100%.'
  } else {
    impactMessage = `Savings will reduce member responsibility from $${(totalPatientResp / 100).toFixed(2)} to $${(memberOwes / 100).toFixed(2)}.`
  }

  return {
    memberOwes,
    potentialRefund,
    oopMet,
    impactMessage
  }
}

/**
 * Compute savings for a specific detection using hierarchical basis
 */
function computeDetectionSavings(
  detection: Detection,
  pricedSummary: PricedSummary,
  lineMatches: EnhancedLineMatch[],
  insurancePlan?: InsurancePlan,
  basis: 'allowed' | 'plan' | 'charge' = 'charge',
  impactedLines: Set<string> = new Set()
): Detection {
  // If detection already has savings and no line refs, return as-is
  if (detection.savingsCents && (!detection.evidence?.lineRefs || detection.evidence.lineRefs.length === 0)) {
    return detection;
  }

  // Get affected lines for this detection
  const affectedLineIds = detection.evidence?.lineRefs || [];
  const affectedLines = pricedSummary.lines.filter(line =>
    affectedLineIds.includes(line.lineId)
  );

  if (affectedLines.length === 0) {
    return detection;
  }

  let totalSavings = 0;

  // Apply rule-specific savings computation
  switch (detection.ruleKey) {
    case 'duplicate_lines':
      totalSavings = computeDuplicateLineSavings(affectedLines, lineMatches, basis, insurancePlan, impactedLines);
      break;

    case 'unbundling_ncci':
      totalSavings = computeUnbundlingSavings(affectedLines, lineMatches, basis, insurancePlan, impactedLines);
      break;

    case 'modifier_misuse':
      totalSavings = computeModifierSavings(affectedLines, lineMatches, basis, insurancePlan, impactedLines);
      break;

    case 'math_errors':
      totalSavings = computeMathErrorSavings(affectedLines, lineMatches, basis, insurancePlan, impactedLines);
      break;

    default:
      // Generic savings computation for other rules
      totalSavings = computeGenericSavings(affectedLines, lineMatches, basis, insurancePlan, impactedLines);
      break;
  }

  return {
    ...detection,
    savingsCents: Math.round(totalSavings)
  };
}

/**
 * Compute savings for duplicate lines
 */
function computeDuplicateLineSavings(
  lines: ParsedLine[],
  lineMatches: EnhancedLineMatch[],
  basis: 'allowed' | 'plan' | 'charge',
  insurancePlan?: InsurancePlan,
  impactedLines: Set<string> = new Set()
): number {
  if (lines.length <= 1) return 0;

  // Keep the first occurrence, refund the duplicates
  const duplicateLines = lines.slice(1);
  let totalSavings = 0;

  for (const line of duplicateLines) {
    if (impactedLines.has(line.lineId)) continue;

    const match = lineMatches.find(m => m.billLine.lineId === line.lineId);
    const savings = match ? match.savingsData.memberSavingsCents : (line.charge || 0);

    totalSavings += savings;
    impactedLines.add(line.lineId);
  }

  return totalSavings;
}

/**
 * Compute savings for NCCI unbundling
 */
function computeUnbundlingSavings(
  lines: ParsedLine[],
  lineMatches: EnhancedLineMatch[],
  basis: 'allowed' | 'plan' | 'charge',
  insurancePlan?: InsurancePlan,
  impactedLines: Set<string> = new Set()
): number {
  let totalSavings = 0;

  // For unbundling, typically remove the component services
  const componentCodes = ['36415', 'J7120', 'J7121', 'J7131']; // Venipuncture, IV fluids

  for (const line of lines) {
    if (!line.code || !componentCodes.includes(line.code)) continue;
    if (impactedLines.has(line.lineId)) continue;

    const match = lineMatches.find(m => m.billLine.lineId === line.lineId);
    const savings = match ? match.savingsData.memberSavingsCents : (line.charge || 0);

    totalSavings += savings;
    impactedLines.add(line.lineId);
  }

  return totalSavings;
}

/**
 * Compute savings for modifier misuse
 */
function computeModifierSavings(
  lines: ParsedLine[],
  lineMatches: EnhancedLineMatch[],
  basis: 'allowed' | 'plan' | 'charge',
  insurancePlan?: InsurancePlan,
  impactedLines: Set<string> = new Set()
): number {
  let totalSavings = 0;

  for (const line of lines) {
    if (impactedLines.has(line.lineId)) continue;

    // For modifier 25 misuse, typically reduce E&M by 50%
    const match = lineMatches.find(m => m.billLine.lineId === line.lineId);
    let savings = match ? match.savingsData.memberSavingsCents : (line.charge || 0);

    if (line.modifiers?.includes('25')) {
      savings *= 0.5; // Partial reduction for inappropriate modifier 25
    }

    totalSavings += savings;
    impactedLines.add(line.lineId);
  }

  return totalSavings;
}

/**
 * Compute savings for math errors
 */
function computeMathErrorSavings(
  lines: ParsedLine[],
  lineMatches: EnhancedLineMatch[],
  basis: 'allowed' | 'plan' | 'charge',
  insurancePlan?: InsurancePlan,
  impactedLines: Set<string> = new Set()
): number {
  let totalSavings = 0;

  for (const line of lines) {
    if (impactedLines.has(line.lineId)) continue;

    // For math errors, the savings is the error amount itself
    if (line.allowed && line.planPaid && line.patientResp) {
      const calculatedPatient = line.allowed - line.planPaid;
      const actualPatient = line.patientResp;
      const errorAmount = Math.abs(calculatedPatient - actualPatient);

      totalSavings += errorAmount;
      impactedLines.add(line.lineId);
    }
  }

  return totalSavings;
}

/**
 * Generic savings computation for other rules
 */
function computeGenericSavings(
  lines: ParsedLine[],
  lineMatches: EnhancedLineMatch[],
  basis: 'allowed' | 'plan' | 'charge',
  insurancePlan?: InsurancePlan,
  impactedLines: Set<string> = new Set()
): number {
  let totalSavings = 0;

  for (const line of lines) {
    if (impactedLines.has(line.lineId)) continue;

    const match = lineMatches.find(m => m.billLine.lineId === line.lineId);
    const savings = match ? match.savingsData.memberSavingsCents : Math.round((line.charge || 0) * 0.15);

    totalSavings += savings;
    impactedLines.add(line.lineId);
  }

  return totalSavings;
}

/**
 * Generate savings summary for reporting
 */
export function generateSavingsSummary(savingsResult: SavingsComputationResult): {
  totalSavings: string
  basis: string
  topSavingsRules: Array<{ rule: string; amount: string }>
  impactedLinesCount: number
} {
  const totalSavings = `$${(savingsResult.savingsTotalCents / 100).toFixed(2)}`

  const basisDescription = {
    allowed: 'EOB allowed amounts (most accurate)',
    plan: 'Insurance plan calculations',
    charge: 'Charge-basis estimates (preliminary)'
  }[savingsResult.basis]

  const topSavingsRules = savingsResult.detections
    .filter(d => d.savingsCents && d.savingsCents > 0)
    .sort((a, b) => (b.savingsCents || 0) - (a.savingsCents || 0))
    .slice(0, 5)
    .map(d => ({
      rule: d.ruleKey.replace(/_/g, ' '),
      amount: `$${((d.savingsCents || 0) / 100).toFixed(2)}`
    }))

  return {
    totalSavings,
    basis: basisDescription,
    topSavingsRules,
    impactedLinesCount: savingsResult.impactedLines.size
  }
}