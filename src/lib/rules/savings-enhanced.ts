/**
 * Enhanced savings computation with allowed-basis hierarchy
 * Priority: EOB allowed-basis → Plan inputs → Charge-basis fallback
 */

import { Detection, PricedSummary, ParsedLine, EOBSummary, InsurancePlan } from '@/lib/types/ocr';

export interface LineMatch {
  billLine: ParsedLine;
  eobLine?: {
    lineId: string;
    allowed?: number;
    planPaid?: number;
    patientResp?: number;
  };
  matchType: 'exact' | 'fuzzy' | 'unmatched';
  matchScore: number;
}

export interface SavingsComputationResult {
  detections: Detection[];
  savingsTotalCents: number;
  basis: 'allowed' | 'plan' | 'charge';
  lineMatches: LineMatch[];
  impactedLines: Set<string>;
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

  // Create line matches between bill and EOB
  const lineMatches = createLineMatches(pricedSummary.lines, eobSummary);
  const impactedLines = new Set<string>();

  // Determine primary computation basis
  const allowedBasisCount = lineMatches.filter(m => m.eobLine?.allowed).length;
  const totalLines = pricedSummary.lines.length;
  const allowedCoverage = totalLines > 0 ? allowedBasisCount / totalLines : 0;

  let basis: 'allowed' | 'plan' | 'charge';
  if (allowedCoverage > 0.5) {
    basis = 'allowed';
    console.log(`📊 Using allowed-basis: ${allowedBasisCount}/${totalLines} lines (${(allowedCoverage * 100).toFixed(1)}%)`);
  } else if (insurancePlan && hasValidPlanInputs(insurancePlan)) {
    basis = 'plan';
    console.log('📋 Using plan-inputs basis with benefit calculations');
  } else {
    basis = 'charge';
    console.log('💳 Using charge-basis fallback');
  }

  // Apply enhanced savings computation to each detection
  const enhancedDetections = detections.map(detection =>
    computeDetectionSavings(detection, pricedSummary, lineMatches, insurancePlan, basis, impactedLines)
  );

  // Calculate total savings
  const savingsTotalCents = enhancedDetections.reduce((total, detection) =>
    total + (detection.savingsCents || 0), 0
  );

  console.log(`✅ Enhanced savings computation complete: $${(savingsTotalCents / 100).toFixed(2)} (${basis}-basis)`);

  return {
    detections: enhancedDetections,
    savingsTotalCents,
    basis,
    lineMatches,
    impactedLines
  };
}

/**
 * Create line matches between bill lines and EOB lines
 */
function createLineMatches(billLines: ParsedLine[], eobSummary?: EOBSummary): LineMatch[] {
  const matches: LineMatch[] = [];

  if (!eobSummary || !eobSummary.lines) {
    // No EOB data - all lines are unmatched
    return billLines.map(billLine => ({
      billLine,
      matchType: 'unmatched' as const,
      matchScore: 0
    }));
  }

  for (const billLine of billLines) {
    const match = findBestEOBMatch(billLine, eobSummary.lines);
    matches.push({
      billLine,
      eobLine: match.eobLine,
      matchType: match.matchType,
      matchScore: match.matchScore
    });
  }

  return matches;
}

/**
 * Find best EOB match for a bill line
 */
function findBestEOBMatch(billLine: ParsedLine, eobLines: any[]): {
  eobLine?: { lineId: string; allowed?: number; planPaid?: number; patientResp?: number };
  matchType: 'exact' | 'fuzzy' | 'unmatched';
  matchScore: number;
} {
  let bestMatch: any = null;
  let bestScore = 0;
  let matchType: 'exact' | 'fuzzy' | 'unmatched' = 'unmatched';

  for (const eobLine of eobLines) {
    let score = 0;

    // Exact code match
    if (billLine.code && eobLine.procedureCode === billLine.code) {
      score += 50;
    }

    // Date of service match
    if (billLine.dos && eobLine.dateOfService) {
      const billDate = new Date(billLine.dos);
      const eobDate = new Date(eobLine.dateOfService);
      if (billDate.getTime() === eobDate.getTime()) {
        score += 30;
      }
    }

    // Description similarity
    if (billLine.description && eobLine.serviceDescription) {
      const similarity = calculateStringSimilarity(
        billLine.description.toLowerCase(),
        eobLine.serviceDescription.toLowerCase()
      );
      score += similarity * 20;
    }

    // Charge proximity (within 10%)
    if (billLine.charge && eobLine.billed) {
      const chargeDiff = Math.abs(billLine.charge - eobLine.billed) / billLine.charge;
      if (chargeDiff < 0.1) {
        score += 10;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = eobLine;
      matchType = score >= 70 ? 'exact' : score >= 30 ? 'fuzzy' : 'unmatched';
    }
  }

  if (bestMatch && bestScore >= 30) {
    return {
      eobLine: {
        lineId: bestMatch.lineId,
        allowed: bestMatch.allowed,
        planPaid: bestMatch.planPaid,
        patientResp: bestMatch.patientResp
      },
      matchType,
      matchScore: bestScore
    };
  }

  return { matchType: 'unmatched', matchScore: 0 };
}

/**
 * Compute savings for a specific detection using hierarchical basis
 */
function computeDetectionSavings(
  detection: Detection,
  pricedSummary: PricedSummary,
  lineMatches: LineMatch[],
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
  lineMatches: LineMatch[],
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
    const savings = computeLineSavings(line, match, basis, insurancePlan);

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
  lineMatches: LineMatch[],
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
    const savings = computeLineSavings(line, match, basis, insurancePlan);

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
  lineMatches: LineMatch[],
  basis: 'allowed' | 'plan' | 'charge',
  insurancePlan?: InsurancePlan,
  impactedLines: Set<string> = new Set()
): number {
  let totalSavings = 0;

  for (const line of lines) {
    if (impactedLines.has(line.lineId)) continue;

    // For modifier 25 misuse, typically reduce E&M by 50%
    const match = lineMatches.find(m => m.billLine.lineId === line.lineId);
    let savings = computeLineSavings(line, match, basis, insurancePlan);

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
  lineMatches: LineMatch[],
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
  lineMatches: LineMatch[],
  basis: 'allowed' | 'plan' | 'charge',
  insurancePlan?: InsurancePlan,
  impactedLines: Set<string> = new Set()
): number {
  let totalSavings = 0;

  for (const line of lines) {
    if (impactedLines.has(line.lineId)) continue;

    const match = lineMatches.find(m => m.billLine.lineId === line.lineId);
    const savings = computeLineSavings(line, match, basis, insurancePlan);

    totalSavings += savings;
    impactedLines.add(line.lineId);
  }

  return totalSavings;
}

/**
 * Compute savings for an individual line using hierarchical basis
 */
function computeLineSavings(
  line: ParsedLine,
  match?: LineMatch,
  basis: 'allowed' | 'plan' | 'charge' = 'charge',
  insurancePlan?: InsurancePlan
): number {
  switch (basis) {
    case 'allowed':
      // Use EOB allowed amount if available
      if (match?.eobLine?.patientResp) {
        return match.eobLine.patientResp;
      }
      // Fall through to plan basis

    case 'plan':
      // Use plan inputs to compute expected patient responsibility
      if (insurancePlan && hasValidPlanInputs(insurancePlan)) {
        return computePlanBasedSavings(line, insurancePlan);
      }
      // Fall through to charge basis

    case 'charge':
    default:
      // Use charge amount as fallback
      return line.charge || 0;
  }
}

/**
 * Compute savings based on plan inputs and benefit calculations
 */
function computePlanBasedSavings(line: ParsedLine, plan: InsurancePlan): number {
  if (!line.charge) return 0;

  // Get plan parameters (assuming they're in cents)
  const deductibleTotal = (plan as any).deductible_ind_total_cents || 0;
  const deductibleMet = (plan as any).deductible_ind_met_cents_at_dos || 0;
  const coinsuranceRate = (plan as any).coinsurance_rate || 0.2; // Default 20%
  const oopTotal = (plan as any).oop_ind_total_cents || 0;
  const oopMet = (plan as any).oop_ind_met_cents_at_dos || 0;

  // Calculate remaining amounts
  const remainingDeductible = Math.max(0, deductibleTotal - deductibleMet);
  const remainingOOP = Math.max(0, oopTotal - oopMet);

  // Compute expected patient share
  let expectedPatientShare = 0;

  if (remainingDeductible > 0) {
    // Patient pays deductible first, then coinsurance
    const deductiblePortion = Math.min(line.charge, remainingDeductible);
    const coinsurancePortion = Math.max(0, line.charge - deductiblePortion) * coinsuranceRate;
    expectedPatientShare = deductiblePortion + coinsurancePortion;
  } else {
    // Only coinsurance applies
    expectedPatientShare = line.charge * coinsuranceRate;
  }

  // Cap at remaining out-of-pocket maximum
  expectedPatientShare = Math.min(expectedPatientShare, remainingOOP);

  return Math.round(expectedPatientShare);
}

/**
 * Check if plan inputs are valid for benefit calculations
 */
function hasValidPlanInputs(plan: InsurancePlan): boolean {
  const planAny = plan as any;
  return !!(
    planAny.deductible_ind_total_cents !== undefined &&
    planAny.coinsurance_rate !== undefined &&
    planAny.oop_ind_total_cents !== undefined
  );
}

/**
 * Calculate string similarity for matching purposes
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate edit distance between two strings
 */
function getEditDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator  // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}