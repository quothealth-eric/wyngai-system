import { ParsedLine, EOBLine, InsurancePlan } from '@/lib/types/ocr'

export interface EnhancedLineMatch {
  billLine: ParsedLine
  eobLine?: EOBLine
  matchScore: number // 0-100
  matchType: 'exact' | 'fuzzy' | 'manual' | 'unmatched'
  savingsData: {
    allowedCents?: number
    planPaidCents?: number
    patientRespCents?: number
    memberSavingsCents: number
    savingsBasis: 'allowed' | 'plan' | 'charge'
  }
}

export interface EnhancedMatchingResult {
  matches: EnhancedLineMatch[]
  stats: {
    totalLines: number
    exactMatches: number
    fuzzyMatches: number
    unmatchedLines: number
    matchRate: number
  }
  totalMemberSavingsCents: number
  savingsBasis: 'allowed' | 'plan' | 'charge'
}

/**
 * Enhanced bill-to-EOB matching with savings hierarchy:
 * 1. allowed → use EOB allowed amounts (most accurate)
 * 2. plan → use insurance plan calculations
 * 3. charge → use charge-basis estimates (fallback)
 */
export function matchBillToEOBEnhanced(
  billLines: ParsedLine[],
  eobLines: EOBLine[] = [],
  insurancePlan?: InsurancePlan
): EnhancedMatchingResult {
  const matches: EnhancedLineMatch[] = []
  let totalMemberSavingsCents = 0

  // Determine overall savings basis
  const hasEOBData = eobLines.length > 0
  const hasPlanData = insurancePlan && Object.keys(insurancePlan).length > 0

  const savingsBasis: 'allowed' | 'plan' | 'charge' = hasEOBData ? 'allowed' :
                                                     hasPlanData ? 'plan' : 'charge'

  console.log(`🔗 Enhanced matching: ${billLines.length} bill lines vs ${eobLines.length} EOB lines`)
  console.log(`📊 Savings basis: ${savingsBasis}`)

  for (const billLine of billLines) {
    const match = createEnhancedMatch(billLine, eobLines, insurancePlan, savingsBasis)
    matches.push(match)
    totalMemberSavingsCents += match.savingsData.memberSavingsCents
  }

  const stats = calculateMatchingStats(matches)

  return {
    matches,
    stats,
    totalMemberSavingsCents,
    savingsBasis
  }
}

/**
 * Create enhanced match for a single bill line
 */
function createEnhancedMatch(
  billLine: ParsedLine,
  eobLines: EOBLine[] = [],
  insurancePlan?: InsurancePlan,
  savingsBasis: 'allowed' | 'plan' | 'charge' = 'charge'
): EnhancedLineMatch {
  // Try to find EOB match first
  const eobMatch = findBestEOBMatch(billLine, eobLines)

  // Calculate savings based on hierarchy
  const savingsData = calculateMemberSavings(billLine, savingsBasis, eobMatch?.eobLine, insurancePlan)

  return {
    billLine,
    eobLine: eobMatch?.eobLine,
    matchScore: eobMatch?.confidence || 0,
    matchType: eobMatch ? getMatchType(eobMatch.confidence) : 'unmatched',
    savingsData
  }
}

/**
 * Calculate member savings using hierarchy: allowed → plan → charge
 */
function calculateMemberSavings(
  billLine: ParsedLine,
  basis: 'allowed' | 'plan' | 'charge',
  eobLine?: EOBLine,
  insurancePlan?: InsurancePlan
): EnhancedLineMatch['savingsData'] {
  const charge = billLine.charge || 0

  if (basis === 'allowed' && eobLine) {
    // Use EOB allowed amounts (most accurate)
    const allowed = eobLine.allowed || 0
    const planPaid = eobLine.planPaid || 0
    const patientResp = eobLine.patientResp || 0

    // Member savings = what they avoid paying on the disallowed portion
    // If bill > allowed, member saves the difference they wouldn't have to pay
    const memberSavings = Math.max(charge - allowed, 0)

    return {
      allowedCents: allowed,
      planPaidCents: planPaid,
      patientRespCents: patientResp,
      memberSavingsCents: memberSavings,
      savingsBasis: 'allowed'
    }
  } else if (basis === 'plan' && insurancePlan) {
    // Use insurance plan calculations
    const estimatedMemberShare = calculatePlanBasedMemberShare(billLine, insurancePlan)
    const memberSavings = Math.max(charge - estimatedMemberShare, 0)

    return {
      memberSavingsCents: memberSavings,
      savingsBasis: 'plan'
    }
  } else {
    // Charge-basis fallback (conservative estimate)
    // Assume member saves 20-30% of charge on average
    const conservativeSavings = Math.round(charge * 0.25)

    return {
      memberSavingsCents: conservativeSavings,
      savingsBasis: 'charge'
    }
  }
}

/**
 * Calculate estimated member share based on insurance plan
 */
function calculatePlanBasedMemberShare(billLine: ParsedLine, plan: InsurancePlan): number {
  const charge = billLine.charge || 0

  // This is a simplified calculation - would need more sophisticated logic
  // for different service types, deductible tracking, etc.

  // Assume typical allowed amount is 40-60% of charge
  const estimatedAllowed = Math.round(charge * 0.5)

  // Apply coinsurance if available
  const coinsurance = plan.inNetworkCoinsurance || 20
  const memberCoinsurance = Math.round(estimatedAllowed * (coinsurance / 100))

  // Add copay if applicable (simplified)
  const copay = estimateApplicableCopay(billLine, plan)

  return memberCoinsurance + copay
}

/**
 * Estimate applicable copay based on service type
 */
function estimateApplicableCopay(billLine: ParsedLine, plan: InsurancePlan): number {
  if (!billLine.code) return 0

  // Emergency services
  if (billLine.pos === '23' || billLine.code.startsWith('9928')) {
    return plan.copayER || 0
  }

  // Specialist visits
  if (billLine.code.startsWith('99') && billLine.code !== '99281') {
    return plan.copaySpecialist || plan.copayPrimary || 0
  }

  // Default to primary care copay
  return plan.copayPrimary || 0
}

/**
 * Find the best matching EOB line for a bill line
 */
function findBestEOBMatch(
  billLine: ParsedLine,
  eobLines: EOBLine[]
): { eobLine: EOBLine; confidence: number } | null {
  let bestMatch: { eobLine: EOBLine; confidence: number } | null = null

  for (const eobLine of eobLines) {
    const confidence = calculateMatchConfidence(billLine, eobLine)

    if (confidence > 50 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = { eobLine, confidence }
    }
  }

  return bestMatch
}

/**
 * Calculate match confidence score (0-100)
 */
function calculateMatchConfidence(billLine: ParsedLine, eobLine: EOBLine): number {
  let score = 0
  let maxScore = 0

  // 1. Procedure code match (40 points max)
  maxScore += 40
  if (billLine.code && eobLine.procedureCode) {
    if (billLine.code === eobLine.procedureCode) {
      score += 40
    } else if (areRelatedCodes(billLine.code, eobLine.procedureCode)) {
      score += 20
    }
  }

  // 2. Date of service match (25 points max)
  maxScore += 25
  if (billLine.dos && eobLine.dateOfService) {
    const daysDiff = calculateDateDifference(billLine.dos, eobLine.dateOfService)
    if (daysDiff === 0) {
      score += 25
    } else if (daysDiff <= 1) {
      score += 20
    } else if (daysDiff <= 7) {
      score += 15
    } else if (daysDiff <= 30) {
      score += 10
    }
  }

  // 3. Amount similarity (25 points max)
  maxScore += 25
  if (billLine.charge && eobLine.billed) {
    const amountDiff = Math.abs(billLine.charge - eobLine.billed) / Math.max(billLine.charge, eobLine.billed)
    if (amountDiff < 0.01) {
      score += 25
    } else if (amountDiff < 0.05) {
      score += 20
    } else if (amountDiff < 0.1) {
      score += 15
    } else if (amountDiff < 0.2) {
      score += 10
    }
  }

  // 4. Description similarity (10 points max)
  maxScore += 10
  if (billLine.description && eobLine.serviceDescription) {
    const similarity = calculateTextSimilarity(billLine.description, eobLine.serviceDescription)
    score += Math.round(similarity * 10)
  }

  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
}

/**
 * Check if two codes are related
 */
function areRelatedCodes(code1: string, code2: string): boolean {
  const base1 = code1.replace(/[-\s].*$/, '')
  const base2 = code2.replace(/[-\s].*$/, '')
  return base1 === base2
}

/**
 * Calculate difference in days between two dates
 */
function calculateDateDifference(date1: string, date2: string): number {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  return Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Calculate text similarity using word overlap
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2))

  const intersection = new Set(Array.from(words1).filter(w => words2.has(w)))
  const union = new Set([...Array.from(words1), ...Array.from(words2)])

  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * Determine match type based on confidence score
 */
function getMatchType(confidence: number): 'exact' | 'fuzzy' | 'manual' {
  if (confidence >= 80) return 'exact'
  if (confidence >= 60) return 'fuzzy'
  return 'manual'
}

/**
 * Calculate matching statistics
 */
function calculateMatchingStats(matches: EnhancedLineMatch[]): EnhancedMatchingResult['stats'] {
  const totalLines = matches.length
  const exactMatches = matches.filter(m => m.matchType === 'exact').length
  const fuzzyMatches = matches.filter(m => m.matchType === 'fuzzy').length
  const unmatchedLines = matches.filter(m => m.matchType === 'unmatched').length

  const matchRate = totalLines > 0 ? (exactMatches + fuzzyMatches) / totalLines : 0

  return {
    totalLines,
    exactMatches,
    fuzzyMatches,
    unmatchedLines,
    matchRate
  }
}