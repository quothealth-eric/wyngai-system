import { ParsedLine, EOBLine, LineMatch } from '@/lib/types/ocr'

/**
 * Match bill lines to EOB lines for allowed-basis calculations
 */
export function matchBillToEOBLines(
  billLines: ParsedLine[],
  eobLines: EOBLine[]
): LineMatch[] {
  const matches: LineMatch[] = []

  for (const billLine of billLines) {
    const bestMatch = findBestEOBMatch(billLine, eobLines)

    if (bestMatch) {
      const allowedBasisSavings = calculateAllowedBasisSavings(billLine, bestMatch.eobLine)

      matches.push({
        billLineId: billLine.lineId,
        eobLineId: bestMatch.eobLine.lineId,
        matchConfidence: bestMatch.confidence,
        matchType: bestMatch.confidence >= 0.8 ? 'exact' :
                  bestMatch.confidence >= 0.6 ? 'fuzzy' : 'manual',
        allowedBasisSavings
      })
    } else {
      // No match found - mark as unmatched
      matches.push({
        billLineId: billLine.lineId,
        eobLineId: undefined,
        matchConfidence: 0,
        matchType: 'unmatched',
        allowedBasisSavings: 0
      })
    }
  }

  return matches
}

/**
 * Find the best matching EOB line for a given bill line
 */
function findBestEOBMatch(
  billLine: ParsedLine,
  eobLines: EOBLine[]
): { eobLine: EOBLine; confidence: number } | null {
  let bestMatch: { eobLine: EOBLine; confidence: number } | null = null

  for (const eobLine of eobLines) {
    const confidence = calculateMatchConfidence(billLine, eobLine)

    if (confidence > 0.5 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = { eobLine, confidence }
    }
  }

  return bestMatch
}

/**
 * Calculate confidence score for matching a bill line to an EOB line
 */
function calculateMatchConfidence(billLine: ParsedLine, eobLine: EOBLine): number {
  let score = 0
  let factors = 0

  // 1. Procedure code match (highest weight)
  if (billLine.code && eobLine.procedureCode) {
    if (billLine.code === eobLine.procedureCode) {
      score += 40 // Exact code match is very strong
      factors += 40
    } else if (areRelatedCodes(billLine.code, eobLine.procedureCode)) {
      score += 20 // Related codes get partial credit
      factors += 40
    } else {
      factors += 40 // Code mismatch is a strong negative signal
    }
  } else if (billLine.code || eobLine.procedureCode) {
    // One has code, other doesn't - slight penalty
    factors += 20
  }

  // 2. Date of service match
  if (billLine.dos && eobLine.dateOfService) {
    const billDate = new Date(billLine.dos)
    const eobDate = new Date(eobLine.dateOfService)
    const daysDiff = Math.abs((billDate.getTime() - eobDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysDiff === 0) {
      score += 20 // Exact date match
    } else if (daysDiff <= 1) {
      score += 15 // Within 1 day
    } else if (daysDiff <= 7) {
      score += 10 // Within a week
    } else if (daysDiff <= 30) {
      score += 5 // Within a month
    }
    factors += 20
  }

  // 3. Amount similarity (billed amount)
  if (billLine.charge && eobLine.billed) {
    const billAmount = billLine.charge
    const eobAmount = eobLine.billed
    const amountDiff = Math.abs(billAmount - eobAmount) / Math.max(billAmount, eobAmount)

    if (amountDiff < 0.01) {
      score += 20 // Exact amount match
    } else if (amountDiff < 0.05) {
      score += 15 // Within 5%
    } else if (amountDiff < 0.1) {
      score += 10 // Within 10%
    } else if (amountDiff < 0.2) {
      score += 5 // Within 20%
    }
    factors += 20
  }

  // 4. Provider/description similarity
  if (billLine.description && eobLine.serviceDescription) {
    const similarity = calculateTextSimilarity(
      billLine.description.toLowerCase(),
      eobLine.serviceDescription.toLowerCase()
    )
    score += similarity * 15
    factors += 15
  }

  // 5. Units match (if available)
  if (billLine.units && eobLine.procedureCode) {
    // This is a rough heuristic - could be improved
    if (billLine.units === 1) {
      score += 5 // Single unit is common
    }
    factors += 5
  }

  // Calculate final confidence as percentage
  return factors > 0 ? Math.min(score / factors, 1) : 0
}

/**
 * Check if two procedure codes are related (e.g., different modifiers)
 */
function areRelatedCodes(code1: string, code2: string): boolean {
  // Remove common modifiers and compare base codes
  const base1 = code1.replace(/[-\s].*$/, '')
  const base2 = code2.replace(/[-\s].*$/, '')

  return base1 === base2
}

/**
 * Calculate text similarity using simple word overlap
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 2))
  const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 2))

  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])

  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * Calculate allowed-basis savings for a matched bill/EOB line pair
 */
function calculateAllowedBasisSavings(billLine: ParsedLine, eobLine: EOBLine): number {
  if (!billLine.charge || !eobLine.allowed) {
    return 0
  }

  // If bill charged more than EOB allowed amount, the difference is potential savings
  const overcharge = billLine.charge - eobLine.allowed
  return Math.max(overcharge, 0)
}

/**
 * Calculate total allowed-basis savings from all line matches
 */
export function calculateTotalAllowedBasisSavings(matches: LineMatch[]): number {
  return matches.reduce((total, match) => {
    return total + (match.allowedBasisSavings || 0)
  }, 0)
}

/**
 * Get match statistics for reporting
 */
export function getMatchingStats(matches: LineMatch[]): {
  totalLines: number
  exactMatches: number
  fuzzyMatches: number
  manualMatches: number
  unmatchedLines: number
  matchRate: number
} {
  const stats = {
    totalLines: matches.length,
    exactMatches: matches.filter(m => m.matchType === 'exact').length,
    fuzzyMatches: matches.filter(m => m.matchType === 'fuzzy').length,
    manualMatches: matches.filter(m => m.matchType === 'manual').length,
    unmatchedLines: matches.filter(m => m.matchType === 'unmatched').length,
    matchRate: 0
  }

  stats.matchRate = stats.totalLines > 0
    ? (stats.exactMatches + stats.fuzzyMatches) / stats.totalLines
    : 0

  return stats
}