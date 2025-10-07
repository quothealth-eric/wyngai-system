import { BenefitsData } from './validations'

export interface MedicalBillAnalysis {
  errorsDetected: string[]
  costValidation: string[]
  recommendations: string[]
  flaggedItems: BillItem[]
  calculatedPatientResponsibility?: number
}

export interface BillItem {
  description: string
  amount: number
  code?: string
  date?: string
  flagReason: string
  severity: 'low' | 'medium' | 'high'
}

export interface ExtractedBillData {
  totalAmount?: number
  patientAmount?: number
  insuranceAmount?: number
  deductibleApplied?: number
  coinsuranceApplied?: number
  providerName?: string
  serviceDate?: string
  billDate?: string
  items: BillItem[]
}

export function extractBillDataFromOCR(ocrText: string): ExtractedBillData {
  const items: BillItem[] = []
  let totalAmount: number | undefined
  let patientAmount: number | undefined
  let insuranceAmount: number | undefined

  // Extract dollar amounts using regex
  const dollarAmounts = ocrText.match(/\$[\d,]+\.?\d*/g) || []
  const amounts = dollarAmounts.map(amount =>
    parseFloat(amount.replace(/[\$,]/g, ''))
  ).filter(amount => !isNaN(amount))

  // Look for common bill structure patterns
  const lines = ocrText.split('\n').map(line => line.trim())

  // Find total amount patterns
  const totalPatterns = [
    /total.*amount.*due.*\$?([\d,]+\.?\d*)/i,
    /amount.*due.*\$?([\d,]+\.?\d*)/i,
    /total.*\$?([\d,]+\.?\d*)/i,
    /balance.*\$?([\d,]+\.?\d*)/i
  ]

  for (const line of lines) {
    for (const pattern of totalPatterns) {
      const match = line.match(pattern)
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''))
        if (!isNaN(amount) && !totalAmount) {
          totalAmount = amount
          break
        }
      }
    }
  }

  // Extract provider name
  const providerPatterns = [
    /provider.*:?\s*(.+)/i,
    /facility.*:?\s*(.+)/i,
    /hospital.*:?\s*(.+)/i,
    /clinic.*:?\s*(.+)/i
  ]

  let providerName: string | undefined
  for (const line of lines) {
    for (const pattern of providerPatterns) {
      const match = line.match(pattern)
      if (match && match[1].length > 3) {
        providerName = match[1].trim()
        break
      }
    }
    if (providerName) break
  }

  // Extract dates
  const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g
  const dates = ocrText.match(datePattern) || []
  const serviceDate = dates[0]
  const billDate = dates[dates.length - 1]

  return {
    totalAmount,
    patientAmount,
    insuranceAmount,
    providerName,
    serviceDate,
    billDate,
    items
  }
}

export function analyzeMedicalBill(
  ocrTexts: string[],
  benefits?: BenefitsData,
  userDescription?: string
): MedicalBillAnalysis {
  const errorsDetected: string[] = []
  const costValidation: string[] = []
  const recommendations: string[] = []
  const flaggedItems: BillItem[] = []

  // Analyze each OCR text
  for (const ocrText of ocrTexts) {
    const billData = extractBillDataFromOCR(ocrText)

    // Check for duplicate charges
    checkForDuplicates(ocrText, errorsDetected, flaggedItems)

    // Check for unreasonable charges
    checkForUnreasonableCharges(billData, errorsDetected, flaggedItems)

    // Validate insurance calculations if benefits provided
    if (benefits && billData.totalAmount) {
      validateInsuranceCalculations(billData, benefits, costValidation, errorsDetected)
    }

    // Check for common billing errors
    checkCommonBillingErrors(ocrText, errorsDetected, flaggedItems)
  }

  // Generate recommendations based on findings
  generateRecommendations(errorsDetected, benefits, recommendations)

  return {
    errorsDetected,
    costValidation,
    recommendations,
    flaggedItems
  }
}

function checkForDuplicates(ocrText: string, errors: string[], flaggedItems: BillItem[]) {
  const lines = ocrText.split('\n')
  const serviceLines = lines.filter(line => /\$[\d,]+\.?\d*/.test(line))

  const seenServices = new Map<string, number>()

  for (const line of serviceLines) {
    const normalizedLine = line.toLowerCase().replace(/\s+/g, ' ').trim()
    const dollarMatch = line.match(/\$[\d,]+\.?\d*/)

    if (dollarMatch) {
      const serviceDescription = normalizedLine.replace(/\$[\d,]+\.?\d*/, '').trim()

      if (serviceDescription.length > 10) { // Ignore very short descriptions
        const count = seenServices.get(serviceDescription) || 0
        seenServices.set(serviceDescription, count + 1)

        if (count > 0) {
          const amount = parseFloat(dollarMatch[0].replace(/[\$,]/g, ''))
          errors.push(`Potential duplicate charge detected: "${serviceDescription}" appears ${count + 1} times`)
          flaggedItems.push({
            description: serviceDescription,
            amount,
            flagReason: 'Potential duplicate charge',
            severity: 'high'
          })
        }
      }
    }
  }
}

function checkForUnreasonableCharges(billData: ExtractedBillData, errors: string[], flaggedItems: BillItem[]) {
  if (!billData.totalAmount) return

  // Flag extremely high charges (adjust thresholds as needed)
  if (billData.totalAmount > 50000) {
    errors.push(`Extremely high total amount: $${billData.totalAmount.toLocaleString()}. Verify this is accurate.`)
    flaggedItems.push({
      description: 'Total bill amount',
      amount: billData.totalAmount,
      flagReason: 'Unusually high total amount',
      severity: 'medium'
    })
  }

  // Check for round numbers (often indicates estimation)
  if (billData.totalAmount % 100 === 0 && billData.totalAmount > 1000) {
    errors.push(`Total amount is a round number ($${billData.totalAmount}), which may indicate an estimate rather than actual charges.`)
  }
}

function validateInsuranceCalculations(
  billData: ExtractedBillData,
  benefits: BenefitsData,
  validation: string[],
  errors: string[]
) {
  if (!billData.totalAmount || !benefits.coinsurance) return

  const totalAmount = billData.totalAmount
  let deductibleOwed = 0
  let coinsuranceOwed = 0

  // Calculate expected deductible
  if (benefits.deductible) {
    const deductibleAmount = typeof benefits.deductible === 'number' ? benefits.deductible : (benefits.deductible?.individual || 0)

    if (benefits.deductibleMet === 'fully_met') {
      deductibleOwed = 0
      validation.push(`Deductible is fully met - patient should owe $0 toward deductible`)
    } else if (benefits.deductibleMet === 'not_met') {
      deductibleOwed = Math.min(totalAmount, deductibleAmount)
      validation.push(`Deductible not met - patient should pay up to $${deductibleAmount}`)
    } else if (benefits.deductibleMet === 'partially_met' && benefits.amountPaidToDeductible) {
      const remainingDeductible = deductibleAmount - benefits.amountPaidToDeductible
      deductibleOwed = Math.min(totalAmount, remainingDeductible)
      validation.push(`Remaining deductible: $${remainingDeductible}`)
    }
  }

  // Calculate expected coinsurance
  const amountAfterDeductible = totalAmount - deductibleOwed
  if (amountAfterDeductible > 0) {
    coinsuranceOwed = amountAfterDeductible * (benefits.coinsurance / 100)
    validation.push(`Expected coinsurance (${benefits.coinsurance}%): $${coinsuranceOwed.toFixed(2)}`)
  }

  const expectedPatientTotal = deductibleOwed + coinsuranceOwed
  validation.push(`Expected total patient responsibility: $${expectedPatientTotal.toFixed(2)}`)

  // Compare with actual patient amount if available
  if (billData.patientAmount && Math.abs(billData.patientAmount - expectedPatientTotal) > 10) {
    errors.push(`Patient amount mismatch: Bill shows $${billData.patientAmount}, but based on benefits should be approximately $${expectedPatientTotal.toFixed(2)}`)
  }
}

function checkCommonBillingErrors(ocrText: string, errors: string[], flaggedItems: BillItem[]) {
  // Check for emergency services (No Surprises Act protection)
  const emergencyKeywords = ['emergency', 'er visit', 'emergency room', 'trauma', 'urgent care']
  const hasEmergencyServices = emergencyKeywords.some(keyword =>
    ocrText.toLowerCase().includes(keyword)
  )

  if (hasEmergencyServices) {
    errors.push('Emergency services detected - verify No Surprises Act protections apply for out-of-network charges')
  }

  // Check for preventive care
  const preventiveKeywords = ['annual', 'wellness', 'screening', 'checkup', 'mammogram', 'colonoscopy', 'physical exam']
  const hasPreventiveServices = preventiveKeywords.some(keyword =>
    ocrText.toLowerCase().includes(keyword)
  )

  if (hasPreventiveServices) {
    errors.push('Preventive services detected - these should typically be covered at 100% for in-network providers')
  }

  // Check for multiple facility fees
  const facilityFeeCount = (ocrText.match(/facility fee/gi) || []).length
  if (facilityFeeCount > 1) {
    errors.push(`Multiple facility fees detected (${facilityFeeCount}) - verify if appropriate for single visit`)
  }
}

function generateRecommendations(errors: string[], benefits: BenefitsData | undefined, recommendations: string[]) {
  if (errors.length === 0) {
    recommendations.push('No obvious billing errors detected. Bill appears to be properly calculated.')
    return
  }

  recommendations.push('Review the flagged issues below with your provider or insurance company')

  if (errors.some(error => error.includes('duplicate'))) {
    recommendations.push('Request an itemized bill to verify all charges are for services actually received')
  }

  if (errors.some(error => error.includes('deductible'))) {
    recommendations.push('Contact your insurance company to verify your current deductible status')
  }

  if (errors.some(error => error.includes('emergency'))) {
    recommendations.push('If you received emergency care, you may be protected by the No Surprises Act from balance billing')
  }

  if (errors.some(error => error.includes('preventive'))) {
    recommendations.push('Preventive services should be covered at 100% - appeal any charges for these services')
  }

  recommendations.push('Consider requesting a payment plan if the amount seems correct but unaffordable')
  recommendations.push('Keep all documentation and correspondence regarding this bill')
}