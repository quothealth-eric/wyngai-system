import { BenefitsData } from './validations'

export interface CostEstimate {
  deductibleRemaining: number
  estimatedCost: number
  explanation: string
}

export function calculateCostEstimate(
  serviceCost: number,
  benefits: BenefitsData,
  deductibleMet = 0
): CostEstimate {
  const {
    deductible = 0,
    coinsurance = 0,
    copay = 0,
    oopMax = 0
  } = benefits

  let estimatedCost = 0
  let explanation = ''
  const deductibleAmount = typeof deductible === 'number' ? deductible : (deductible?.individual || 0)
  const deductibleRemaining = Math.max(0, deductibleAmount - deductibleMet)

  if (copay > 0) {
    // Copay scenario - flat fee
    estimatedCost = copay
    explanation = `With your copay plan, you would typically pay $${copay} for this service.`
  } else {
    // Deductible + coinsurance scenario
    if (deductibleRemaining > 0) {
      if (serviceCost <= deductibleRemaining) {
        // Service cost is less than remaining deductible
        estimatedCost = serviceCost
        explanation = `You have $${deductibleRemaining} remaining on your deductible, so you would pay the full service cost of $${serviceCost}.`
      } else {
        // Service cost exceeds remaining deductible
        const deductiblePortion = deductibleRemaining
        const coinsurancePortion = (serviceCost - deductibleRemaining) * (coinsurance / 100)
        estimatedCost = deductiblePortion + coinsurancePortion

        explanation = `You would pay $${deductibleRemaining} toward your remaining deductible, plus ${coinsurance}% coinsurance ($${coinsurancePortion.toFixed(2)}) on the remaining $${(serviceCost - deductibleRemaining).toFixed(2)}, for a total of $${estimatedCost.toFixed(2)}.`
      }
    } else {
      // Deductible already met
      estimatedCost = serviceCost * (coinsurance / 100)
      explanation = `Since your deductible is met, you would pay ${coinsurance}% coinsurance, which is $${estimatedCost.toFixed(2)}.`
    }
  }

  // Apply out-of-pocket maximum if applicable
  if (oopMax > 0 && estimatedCost > oopMax) {
    estimatedCost = oopMax
    explanation += ` However, this would exceed your out-of-pocket maximum of $${oopMax}, so your cost would be capped at that amount.`
  }

  return {
    deductibleRemaining,
    estimatedCost: Math.round(estimatedCost * 100) / 100, // Round to cents
    explanation
  }
}

export function validateBenefits(benefits: BenefitsData): string[] {
  const errors: string[] = []

  if (benefits.deductible) {
    const deductibleAmount = typeof benefits.deductible === 'number' ? benefits.deductible : benefits.deductible?.individual
    if (deductibleAmount && deductibleAmount < 0) {
      errors.push('Deductible cannot be negative')
    }
  }

  if (benefits.coinsurance && (benefits.coinsurance < 0 || benefits.coinsurance > 100)) {
    errors.push('Coinsurance must be between 0 and 100 percent')
  }

  if (benefits.copay && benefits.copay < 0) {
    errors.push('Copay cannot be negative')
  }

  if (benefits.oopMax && benefits.oopMax < 0) {
    errors.push('Out-of-pocket maximum cannot be negative')
  }

  if (benefits.deductible && benefits.oopMax) {
    const deductibleAmount = typeof benefits.deductible === 'number' ? benefits.deductible : benefits.deductible?.individual
    if (deductibleAmount && deductibleAmount > benefits.oopMax) {
      errors.push('Deductible cannot be higher than out-of-pocket maximum')
    }
  }

  return errors
}

export function extractBenefitsFromText(text: string): Partial<BenefitsData> {
  const benefits: Partial<BenefitsData> = {}

  // Extract deductible
  const deductibleMatch = text.match(/deductible[:\s]*\$?(\d+(?:,\d{3})*)/i)
  if (deductibleMatch) {
    benefits.deductible = parseInt(deductibleMatch[1].replace(',', ''))
  }

  // Extract coinsurance
  const coinsuranceMatch = text.match(/coinsurance[:\s]*(\d+)%/i)
  if (coinsuranceMatch) {
    benefits.coinsurance = parseInt(coinsuranceMatch[1])
  }

  // Extract copay
  const copayMatch = text.match(/copay[:\s]*\$?(\d+)/i)
  if (copayMatch) {
    benefits.copay = parseInt(copayMatch[1])
  }

  // Extract out-of-pocket maximum
  const oopMatch = text.match(/out.of.pocket[:\s]*\$?(\d+(?:,\d{3})*)/i)
  if (oopMatch) {
    benefits.oopMax = parseInt(oopMatch[1].replace(',', ''))
  }

  return benefits
}

export const commonPlanTypes = [
  'HMO',
  'PPO',
  'EPO',
  'POS',
  'HDHP',
  'Other'
] as const

export const commonInsurers = [
  'UnitedHealthcare',
  'Anthem BCBS',
  'Aetna',
  'Cigna',
  'Humana',
  'Kaiser Permanente',
  'Other'
] as const