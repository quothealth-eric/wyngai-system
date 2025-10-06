import { ChatCaseInput } from './case-fusion'
import { Detection } from './rules-engine'
import { IntentClassification } from './intent-classifier'

export interface ChatAnswer {
  extractionTable: {
    header: {
      providerName?: string
      NPI?: string
      claimId?: string
      accountId?: string
      serviceDates?: string
      payer?: string
    }
    totals?: {
      billed?: number
      allowed?: number
      planPaid?: number
      patientResp?: number
    }
    lines: Array<{
      lineId: string
      code?: string
      modifiers?: string[]
      description?: string
      units?: number
      dos?: string
      pos?: string
      revCode?: string
      npi?: string
      charge?: number
      allowed?: number
      planPaid?: number
      patientResp?: number
      conf?: number
    }>
    notes?: string[]
  }
  analysis: {
    summary: string
    likelyIssues: Detection[]
    benefitsMath?: {
      expected?: number
      observed?: number
      breakdown?: any
    }
  }
  scriptsAndLetters: {
    phoneScripts: ScriptTemplate[]
    appealLetters: AppealLetter[]
  }
  nextSteps: Array<{
    label: string
    dueDateISO?: string
  }>
  disclaimers: string[]
}

export interface ScriptTemplate {
  id: string
  title: string
  scenario: string
  script: string
  parameters: { [key: string]: string }
}

export interface AppealLetter {
  id: string
  title: string
  type: 'internal_appeal' | 'external_review' | 'provider_dispute'
  letterContent: string
  parameters: { [key: string]: string }
  attachments: string[]
}

export class AnswerPackGenerator {
  static generateAnswerPack(
    caseInput: ChatCaseInput,
    intent: IntentClassification,
    detections: Detection[]
  ): ChatAnswer {
    const extractionTable = this.buildExtractionTable(caseInput)
    const analysis = this.buildAnalysis(caseInput, detections, intent)
    const scriptsAndLetters = this.buildScriptsAndLetters(caseInput, detections, intent)
    const nextSteps = this.buildNextSteps(caseInput, detections, intent)
    const disclaimers = this.buildDisclaimers()

    return {
      extractionTable,
      analysis,
      scriptsAndLetters,
      nextSteps,
      disclaimers
    }
  }

  private static buildExtractionTable(caseInput: ChatCaseInput): ChatAnswer['extractionTable'] {
    const notes: string[] = []

    if (caseInput.images.length > 0) {
      const avgConfidence = caseInput.images.reduce((sum, img) => sum + img.ocrConf, 0) / caseInput.images.length
      if (avgConfidence < 80) {
        notes.push(`OCR confidence is ${avgConfidence.toFixed(1)}% - some data may be inaccurate`)
      }
    }

    if (caseInput.extracted.lines.length === 0) {
      notes.push('No detailed line items extracted - consider uploading a clearer document')
    }

    return {
      header: {
        providerName: caseInput.extracted.header.providerName,
        NPI: caseInput.extracted.header.NPI,
        claimId: caseInput.extracted.header.claimId,
        accountId: caseInput.extracted.header.accountId,
        serviceDates: caseInput.extracted.header.serviceDates?.join(', '),
        payer: caseInput.extracted.header.payer
      },
      totals: caseInput.extracted.totals,
      lines: caseInput.extracted.lines,
      notes: notes.length > 0 ? notes : undefined
    }
  }

  private static buildAnalysis(
    caseInput: ChatCaseInput,
    detections: Detection[],
    intent: IntentClassification
  ): ChatAnswer['analysis'] {
    const summary = this.generateSummary(caseInput, detections, intent)
    const benefitsMath = this.calculateBenefitsMath(caseInput)

    return {
      summary,
      likelyIssues: detections,
      benefitsMath
    }
  }

  private static generateSummary(
    caseInput: ChatCaseInput,
    detections: Detection[],
    intent: IntentClassification
  ): string {
    const parts: string[] = []

    parts.push("I understand you're dealing with a medical billing concern, and I'm here to help you navigate this situation.")

    if (detections.length > 0) {
      const highSeverityCount = detections.filter(d => d.severity === 'high').length
      if (highSeverityCount > 0) {
        parts.push(`I've identified ${highSeverityCount} significant billing issue${highSeverityCount > 1 ? 's' : ''} that need your attention.`)
      } else {
        parts.push("I've reviewed your situation and found some areas that warrant further investigation.")
      }
    } else {
      parts.push("While I didn't find obvious billing errors, I can still help you understand your situation and next steps.")
    }

    switch (intent.primaryIntent) {
      case 'surprise_billing':
        parts.push("Surprise billing situations can be frustrating, but you have strong legal protections under federal and state laws.")
        break
      case 'preventive_coding':
        parts.push("Preventive services should typically be covered at 100% for in-network providers, so any charges may be incorrect.")
        break
      case 'eob_bill_mismatch':
        parts.push("Discrepancies between your EOB and bill are not uncommon, but they need to be resolved to ensure you're paying the correct amount.")
        break
      case 'facility_fee':
        parts.push("Facility fees at hospital-owned clinics must be properly disclosed, and you may have grounds to challenge unexpected fees.")
        break
      default:
        parts.push("Every billing situation is unique, but there are established processes to address most issues.")
    }

    const totalAmount = caseInput.extracted.totals.patientResp || caseInput.extracted.totals.billed
    if (totalAmount && totalAmount > 0) {
      parts.push(`The amount in question appears to be $${totalAmount.toLocaleString()}, which makes it worth pursuing resolution.`)
    }

    return parts.join(' ')
  }

  private static calculateBenefitsMath(caseInput: ChatCaseInput): ChatAnswer['analysis']['benefitsMath'] {
    if (!caseInput.benefits || !caseInput.extracted.totals.billed) {
      return undefined
    }

    const benefits = caseInput.benefits
    const billedAmount = caseInput.extracted.totals.billed
    const observedAmount = caseInput.extracted.totals.patientResp || 0

    let expectedAmount = 0
    const breakdown: any = {}

    if (benefits.deductible) {
      const deductibleMet = benefits.deductible.met || 0
      const deductibleRemaining = Math.max(0, (benefits.deductible.individual || 0) - deductibleMet)
      const deductibleToApply = Math.min(billedAmount, deductibleRemaining)

      expectedAmount += deductibleToApply
      breakdown.deductible = deductibleToApply

      const amountAfterDeductible = billedAmount - deductibleToApply

      if (amountAfterDeductible > 0 && benefits.coinsurance) {
        const coinsuranceAmount = amountAfterDeductible * (benefits.coinsurance / 100)
        expectedAmount += coinsuranceAmount
        breakdown.coinsurance = coinsuranceAmount
      }
    }

    if (benefits.oopMax?.individual) {
      expectedAmount = Math.min(expectedAmount, benefits.oopMax.individual)
      breakdown.oopMaxApplied = expectedAmount === benefits.oopMax.individual
    }

    return {
      expected: expectedAmount,
      observed: observedAmount,
      breakdown
    }
  }

  private static buildScriptsAndLetters(
    caseInput: ChatCaseInput,
    detections: Detection[],
    intent: IntentClassification
  ): ChatAnswer['scriptsAndLetters'] {
    const phoneScripts = this.generatePhoneScripts(caseInput, detections, intent)
    const appealLetters = this.generateAppealLetters(caseInput, detections, intent)

    return {
      phoneScripts,
      appealLetters
    }
  }

  private static generatePhoneScripts(
    caseInput: ChatCaseInput,
    detections: Detection[],
    intent: IntentClassification
  ): ScriptTemplate[] {
    const scripts: ScriptTemplate[] = []

    const topDetection = detections[0]
    const providerName = caseInput.extracted.header.providerName || '[Provider Name]'
    const accountId = caseInput.extracted.header.accountId || '[Account Number]'
    const claimId = caseInput.extracted.header.claimId || '[Claim Number]'
    const amount = caseInput.extracted.totals.patientResp || '[Amount]'

    if (topDetection?.category === 'Math Error') {
      scripts.push({
        id: 'billing_office_math_error',
        title: 'Billing Office Call - Math Error',
        scenario: 'Call the provider billing office about calculation errors',
        script: `Hi, I'm calling about my account ${accountId}. I've reviewed my bill and found some calculation errors that need to be corrected.

Specifically, the total charges don't match the sum of the line items. When I add up all the individual charges, I get a different total than what's shown on the bill.

Can you please review the account and provide a corrected statement? I have the specific line items here if you need me to go through them with you.

I'd like this resolved before making any payment since I want to ensure I'm paying the correct amount.

Can you tell me when I can expect a corrected bill?`,
        parameters: {
          accountId,
          providerName
        }
      })
    }

    if (intent.primaryIntent === 'surprise_billing' || topDetection?.category === 'No Surprises Act Violation') {
      scripts.push({
        id: 'nsa_reprocessing_request',
        title: 'Insurance Call - No Surprises Act Protection',
        scenario: 'Call insurance to request reprocessing under No Surprises Act',
        script: `Hi, I need to discuss claim ${claimId} that was processed incorrectly under the No Surprises Act.

I received out-of-network charges for services at an in-network facility. Under the No Surprises Act, I should be protected from these surprise bills.

The services were provided at ${providerName}, which is in my network, but I'm being charged out-of-network rates for ancillary services.

I'm requesting that this claim be reprocessed with in-network benefits applied to all services provided at the in-network facility.

Can you please review this claim and apply the appropriate No Surprises Act protections? When can I expect the corrected processing?`,
        parameters: {
          claimId,
          providerName
        }
      })
    }

    if (intent.primaryIntent === 'preventive_coding') {
      scripts.push({
        id: 'preventive_recoding_request',
        title: 'Provider Call - Preventive Service Recoding',
        scenario: 'Call provider to request preventive service recoding',
        script: `Hi, I'm calling about account ${accountId} for preventive services that were incorrectly coded.

The services I received should be covered as preventive care under the Affordable Care Act, but they appear to have been coded as diagnostic services.

Preventive services must be covered at 100% when provided by in-network providers. Can you please review the coding and resubmit the claim with the correct preventive codes?

I'd like to get this corrected before I receive any further bills. When can you resubmit this to my insurance?`,
        parameters: {
          accountId,
          providerName
        }
      })
    }

    if (topDetection?.category === 'Timely Filing') {
      scripts.push({
        id: 'timely_filing_writeoff',
        title: 'Provider Call - Timely Filing Write-off',
        scenario: 'Call provider to request write-off for timely filing failure',
        script: `Hi, I'm calling about account ${accountId} regarding a timely filing issue.

My insurance company denied this claim because it was submitted after the filing deadline. This is a provider administrative issue, not a patient responsibility.

Under both state and federal regulations, patients cannot be held responsible for provider timely filing failures. I'm requesting that this balance be written off.

Can you please adjust my account to remove this charge? I have the denial letter from my insurance if you need documentation.`,
        parameters: {
          accountId,
          providerName
        }
      })
    }

    if (caseInput.benefits?.secondaryCoverage) {
      scripts.push({
        id: 'coordinate_benefits',
        title: 'Insurance Call - Coordinate Secondary Coverage',
        scenario: 'Call to ensure secondary insurance is properly applied',
        script: `Hi, I need help coordinating benefits for claim ${claimId}. I have secondary insurance coverage that doesn't appear to have been applied.

My primary insurance processed the claim, but my secondary coverage should reduce my out-of-pocket costs further.

Can you please make sure my secondary insurance information is on file and coordinate benefits properly? I can provide the secondary insurance details if needed.

When will the secondary processing be complete?`,
        parameters: {
          claimId
        }
      })
    }

    return scripts
  }

  private static generateAppealLetters(
    caseInput: ChatCaseInput,
    detections: Detection[],
    intent: IntentClassification
  ): AppealLetter[] {
    const letters: AppealLetter[] = []

    const topDetection = detections[0]
    const today = new Date().toLocaleDateString()
    const patientName = '[Your Name]'
    const memberId = '[Member ID]'
    const claimId = caseInput.extracted.header.claimId || '[Claim Number]'
    const providerName = caseInput.extracted.header.providerName || '[Provider Name]'
    const serviceDate = caseInput.extracted.header.serviceDates?.[0] || '[Service Date]'
    const amount = caseInput.extracted.totals.patientResp || '[Amount]'

    if (intent.primaryIntent === 'surprise_billing' || topDetection?.category === 'No Surprises Act Violation') {
      letters.push({
        id: 'nsa_internal_appeal',
        title: 'No Surprises Act Internal Appeal',
        type: 'internal_appeal',
        letterContent: `Date: ${today}

To: [Insurance Company Appeals Department]
Re: Internal Appeal for No Surprises Act Violation
Member ID: ${memberId}
Claim Number: ${claimId}

Dear Appeals Review Team,

I am writing to formally appeal the processing of the above-referenced claim, which violates the No Surprises Act protections that should apply to my situation.

FACTS:
• Service Date: ${serviceDate}
• Provider: ${providerName}
• I received services at an in-network facility
• Out-of-network charges were applied to services that should be protected under the No Surprises Act

ISSUE:
Under the No Surprises Act (effective January 1, 2022), I am protected from surprise bills when receiving covered services from out-of-network providers at in-network facilities. The law requires these services to be processed at in-network rates.

LEGAL BASIS:
The No Surprises Act, Section 2799A-1, prohibits balance billing for:
1. Emergency services regardless of network status
2. Non-emergency services by out-of-network providers at in-network facilities when the patient did not have the ability to choose an in-network provider

REQUESTED RESOLUTION:
I request that you:
1. Reprocess this claim applying in-network benefits to all services
2. Issue a corrected Explanation of Benefits
3. Ensure any overpayment is refunded within 30 days

I have attached copies of the original bill and EOB for your review. Please contact me at [phone number] if you need additional information.

I look forward to your prompt resolution of this matter within the required 30-day timeframe.

Sincerely,
${patientName}

Attachments: Original bill, EOB, service records`,
        parameters: {
          memberId,
          claimId,
          serviceDate,
          providerName,
          patientName
        },
        attachments: ['Original bill', 'EOB', 'Service records']
      })
    }

    if (intent.primaryIntent === 'preventive_coding') {
      letters.push({
        id: 'preventive_appeal',
        title: 'ACA Preventive Services Appeal',
        type: 'internal_appeal',
        letterContent: `Date: ${today}

To: [Insurance Company Appeals Department]
Re: Appeal for Preventive Services Coverage
Member ID: ${memberId}
Claim Number: ${claimId}

Dear Appeals Review Team,

I am appealing the denial/partial payment of preventive services that should be covered at 100% under the Affordable Care Act.

FACTS:
• Service Date: ${serviceDate}
• Provider: ${providerName} (in-network)
• Services provided were preventive in nature
• I was charged $${amount} for services that should be free

ISSUE:
The Affordable Care Act requires that preventive services be covered at 100% when provided by in-network providers. The services I received fall under the preventive care mandate.

LEGAL BASIS:
Under ACA Section 2713, group health plans and health insurance issuers must provide coverage for preventive health services without any cost sharing requirements when such services are provided by in-network providers.

REQUESTED RESOLUTION:
1. Reprocess the claim as preventive services with 100% coverage
2. Remove all patient cost sharing (deductible, copay, coinsurance)
3. Issue refund for any amounts already paid

Please review the attached clinical documentation showing the preventive nature of these services.

Sincerely,
${patientName}

Attachments: Clinical notes, preventive services documentation`,
        parameters: {
          memberId,
          claimId,
          serviceDate,
          providerName,
          amount: amount.toString(),
          patientName
        },
        attachments: ['Clinical notes', 'Preventive services documentation']
      })
    }

    if (topDetection?.category === 'Math Error') {
      letters.push({
        id: 'billing_correction_request',
        title: 'Billing Correction Request',
        type: 'provider_dispute',
        letterContent: `Date: ${today}

To: ${providerName} Billing Department
Re: Request for Billing Correction
Account Number: ${caseInput.extracted.header.accountId || '[Account Number]'}

Dear Billing Manager,

I am writing to request correction of mathematical errors in my recent bill.

ISSUE IDENTIFIED:
Upon careful review of my statement, I have identified calculation errors where the total amounts do not match the sum of individual line items.

SPECIFIC ERRORS:
• Line item charges total: $[Calculated Total]
• Bill shows total: $[Billed Total]
• Difference: $[Difference Amount]

REQUESTED ACTION:
Please review my account and issue a corrected statement showing accurate calculations. I want to ensure I pay the correct amount and need this resolved before making payment.

SUPPORTING DOCUMENTATION:
I have performed a detailed line-by-line analysis which I can share if needed to help identify the source of the calculation error.

Please contact me at [phone number] when the corrected bill is ready or if you need any additional information.

Thank you for your prompt attention to this matter.

Sincerely,
${patientName}

Account Number: ${caseInput.extracted.header.accountId || '[Account Number]'}`,
        parameters: {
          providerName,
          patientName,
          accountId: caseInput.extracted.header.accountId || '[Account Number]'
        },
        attachments: ['Original bill', 'Calculation worksheet']
      })
    }

    return letters
  }

  private static buildNextSteps(
    caseInput: ChatCaseInput,
    detections: Detection[],
    intent: IntentClassification
  ): ChatAnswer['nextSteps'] {
    const steps: Array<{ label: string; dueDateISO?: string }> = []

    if (detections.length > 0) {
      const urgentDetections = detections.filter(d => d.severity === 'high')
      if (urgentDetections.length > 0) {
        steps.push({
          label: 'Address high-priority billing issues immediately',
          dueDateISO: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
      }
    }

    if (intent.clarificationNeeded) {
      steps.push({
        label: intent.suggestedQuestion || 'Provide additional information for better guidance'
      })
    }

    switch (intent.primaryIntent) {
      case 'surprise_billing':
        steps.push({
          label: 'Contact insurance company to request No Surprises Act protection',
          dueDateISO: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
        })
        break

      case 'preventive_coding':
        steps.push({
          label: 'Request provider recode services as preventive',
          dueDateISO: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
        })
        break

      case 'eob_bill_mismatch':
        steps.push({
          label: 'Compare EOB and bill line by line to identify discrepancies'
        })
        break
    }

    if (caseInput.extracted.appeal?.deadlineDateISO) {
      steps.push({
        label: 'Submit formal appeal before deadline',
        dueDateISO: caseInput.extracted.appeal.deadlineDateISO
      })
    } else if (detections.some(d => d.severity === 'high')) {
      steps.push({
        label: 'File insurance appeal if provider does not resolve issues',
        dueDateISO: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
    }

    if (caseInput.extracted.lines.length === 0) {
      steps.push({
        label: 'Request detailed itemized bill from provider'
      })
    }

    steps.push({
      label: 'Keep all documentation and correspondence for your records'
    })

    if (detections.some(d => d.suggestedAction?.includes('state'))) {
      steps.push({
        label: 'Contact state insurance department if issues persist',
        dueDateISO: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString()
      })
    }

    return steps
  }

  private static buildDisclaimers(): string[] {
    return [
      'This analysis provides educational information, not legal or medical advice.',
      'Healthcare billing laws vary by state and insurance plan.',
      'Always verify information with your insurance company and healthcare providers.',
      'Wyng does not sell or share your personal health information.',
      'For complex cases, consider consulting with a patient advocate or healthcare attorney.'
    ]
  }
}