import { ChatCaseInput } from './case-fusion'

export interface IntentClassification {
  primaryIntent: string
  secondaryIntents: string[]
  confidence: number
  clarificationNeeded: boolean
  suggestedQuestion?: string
}

export interface Intent {
  id: string
  name: string
  description: string
  keywords: string[]
  patterns: RegExp[]
  requiresDocuments: boolean
  requiresBenefits: boolean
}

export class IntentClassifier {
  private static intents: Intent[] = [
    {
      id: 'surprise_billing',
      name: 'Surprise Billing',
      description: 'Ancillary out-of-network charges at in-network facility or emergency situations',
      keywords: ['surprise', 'balance bill', 'out of network', 'emergency', 'oon', 'ancillary'],
      patterns: [
        /surprise.{0,20}bill/i,
        /balance.{0,20}bill/i,
        /out.{0,10}network.{0,20}facility/i,
        /emergency.{0,20}room/i
      ],
      requiresDocuments: true,
      requiresBenefits: false
    },
    {
      id: 'facility_fee',
      name: 'Facility Fee',
      description: 'Hospital-owned clinic charges facility fees',
      keywords: ['facility fee', 'hospital clinic', 'outpatient'],
      patterns: [
        /facility.{0,20}fee/i,
        /hospital.{0,20}clinic/i,
        /outpatient.{0,20}facility/i
      ],
      requiresDocuments: true,
      requiresBenefits: false
    },
    {
      id: 'eob_bill_mismatch',
      name: 'EOB vs Bill Mismatch',
      description: 'Discrepancies between EOB and medical bill amounts',
      keywords: ['eob', 'explanation of benefits', 'mismatch', 'different amounts'],
      patterns: [
        /eob.{0,20}bill.{0,20}different/i,
        /explanation.{0,30}benefits.{0,20}wrong/i,
        /amounts?.{0,20}don.t.{0,10}match/i
      ],
      requiresDocuments: true,
      requiresBenefits: true
    },
    {
      id: 'preventive_coding',
      name: 'Preventive vs Diagnostic',
      description: 'Preventive services incorrectly coded as diagnostic',
      keywords: ['preventive', 'screening', 'wellness', 'annual', 'diagnostic', 'should be free'],
      patterns: [
        /preventive.{0,20}charged/i,
        /screening.{0,20}not.{0,20}free/i,
        /wellness.{0,20}visit.{0,20}charge/i,
        /annual.{0,20}physical.{0,20}cost/i
      ],
      requiresDocuments: true,
      requiresBenefits: false
    },
    {
      id: 'oon_lab_routing',
      name: 'Out-of-Network Lab/Path/Radiology',
      description: 'Lab, pathology, or radiology services routed out-of-network',
      keywords: ['lab', 'pathology', 'radiology', 'out of network', 'routing'],
      patterns: [
        /lab.{0,20}out.{0,10}network/i,
        /pathology.{0,20}oon/i,
        /radiology.{0,20}not.{0,20}covered/i,
        /blood.{0,20}work.{0,20}expensive/i
      ],
      requiresDocuments: true,
      requiresBenefits: true
    },
    {
      id: 'prior_auth_denial',
      name: 'Prior Authorization/Referral Denial',
      description: 'Services denied due to prior auth or referral requirements',
      keywords: ['prior auth', 'referral', 'denied', 'not authorized'],
      patterns: [
        /prior.{0,10}auth.{0,20}denied/i,
        /referral.{0,20}required/i,
        /not.{0,20}authorized/i,
        /precertification.{0,20}needed/i
      ],
      requiresDocuments: true,
      requiresBenefits: false
    },
    {
      id: 'ground_ambulance',
      name: 'Ground Ambulance',
      description: 'Ground ambulance balance billing issues',
      keywords: ['ambulance', 'emergency transport', 'balance bill'],
      patterns: [
        /ambulance.{0,20}bill/i,
        /emergency.{0,20}transport/i,
        /ambulance.{0,20}expensive/i
      ],
      requiresDocuments: true,
      requiresBenefits: false
    },
    {
      id: 'coordination_benefits',
      name: 'Coordination of Benefits',
      description: 'Secondary insurance not applied correctly',
      keywords: ['secondary insurance', 'coordination of benefits', 'cob', 'dual coverage'],
      patterns: [
        /secondary.{0,20}insurance/i,
        /coordination.{0,20}benefits/i,
        /dual.{0,20}coverage/i,
        /two.{0,20}insurances/i
      ],
      requiresDocuments: true,
      requiresBenefits: true
    },
    {
      id: 'timely_filing',
      name: 'Timely Filing',
      description: 'Late submission billed to patient instead of being written off',
      keywords: ['timely filing', 'late submission', 'provider delay'],
      patterns: [
        /timely.{0,20}filing/i,
        /late.{0,20}submission/i,
        /provider.{0,20}delay/i,
        /submitted.{0,20}late/i
      ],
      requiresDocuments: true,
      requiresBenefits: false
    },
    {
      id: 'global_surgery',
      name: 'Global Surgery Period',
      description: 'Related services during global surgery period',
      keywords: ['global period', 'surgery', 'post-op', 'follow-up'],
      patterns: [
        /global.{0,20}period/i,
        /surgery.{0,20}follow.{0,10}up/i,
        /post.{0,10}op.{0,20}charge/i
      ],
      requiresDocuments: true,
      requiresBenefits: false
    },
    {
      id: 'imaging_split',
      name: 'Imaging Professional/Technical Split',
      description: 'Unexpected separate charges for imaging interpretation',
      keywords: ['professional component', 'technical component', 'radiology read', 'imaging'],
      patterns: [
        /professional.{0,20}component/i,
        /technical.{0,20}component/i,
        /radiology.{0,20}read/i,
        /imaging.{0,20}interpretation/i
      ],
      requiresDocuments: true,
      requiresBenefits: false
    },
    {
      id: 'drug_units',
      name: 'Drug Units Sanity Check',
      description: 'J-code drug units seem implausible',
      keywords: ['j-code', 'drug units', 'medication', 'units'],
      patterns: [
        /j.{0,5}code.{0,20}units/i,
        /drug.{0,20}units/i,
        /medication.{0,20}dosage/i
      ],
      requiresDocuments: true,
      requiresBenefits: false
    },
    {
      id: 'newborn_coverage',
      name: 'Newborn Coverage',
      description: 'Newborn coverage timing and enrollment issues',
      keywords: ['newborn', 'baby', 'enrollment', 'first 30 days'],
      patterns: [
        /newborn.{0,20}coverage/i,
        /baby.{0,20}insurance/i,
        /enrollment.{0,20}timing/i,
        /first.{0,20}30.{0,20}days/i
      ],
      requiresDocuments: true,
      requiresBenefits: true
    },
    {
      id: 'oop_max_math',
      name: 'Out-of-Pocket Maximum Math Error',
      description: 'Out-of-pocket maximum calculations appear incorrect',
      keywords: ['out of pocket maximum', 'oop max', 'math error', 'calculation'],
      patterns: [
        /out.{0,10}pocket.{0,20}max/i,
        /oop.{0,20}max/i,
        /deductible.{0,20}met/i,
        /calculation.{0,20}wrong/i
      ],
      requiresDocuments: true,
      requiresBenefits: true
    },
    {
      id: 'itemized_bill_request',
      name: 'Need Itemized Bill',
      description: 'Only summary bill provided, need itemized version',
      keywords: ['itemized bill', 'summary only', 'line items', 'detailed bill'],
      patterns: [
        /itemized.{0,20}bill/i,
        /summary.{0,20}only/i,
        /line.{0,20}items/i,
        /detailed.{0,20}bill/i,
        /breakdown/i
      ],
      requiresDocuments: false,
      requiresBenefits: false
    },
    {
      id: 'general_eob_literacy',
      name: 'General EOB Understanding',
      description: 'Help understanding what EOB means',
      keywords: ['what does this mean', 'understand', 'eob', 'explanation'],
      patterns: [
        /what.{0,20}does.{0,20}this.{0,20}mean/i,
        /don.t.{0,20}understand/i,
        /explain.{0,20}eob/i,
        /confused.{0,20}about/i
      ],
      requiresDocuments: true,
      requiresBenefits: false
    }
  ]

  static classifyIntent(caseInput: ChatCaseInput): IntentClassification {
    const narrative = caseInput.narrative.text.toLowerCase()
    const tags = caseInput.narrative.tags || []
    const hasDocuments = caseInput.images.length > 0
    const hasBenefits = !!caseInput.benefits
    const hasExtractedData = caseInput.extracted.lines.length > 0

    const intentScores: { [intentId: string]: number } = {}

    for (const intent of this.intents) {
      let score = 0

      for (const keyword of intent.keywords) {
        if (narrative.includes(keyword.toLowerCase())) {
          score += 2
        }
      }

      for (const pattern of intent.patterns) {
        if (pattern.test(narrative)) {
          score += 3
        }
      }

      for (const tag of tags) {
        if (intent.id.includes(tag) || intent.keywords.some(kw => kw.includes(tag))) {
          score += 2
        }
      }

      if (intent.requiresDocuments && !hasDocuments) {
        score *= 0.5
      }

      if (intent.requiresBenefits && !hasBenefits) {
        score *= 0.7
      }

      intentScores[intent.id] = score
    }

    const sortedIntents = Object.entries(intentScores)
      .filter(([_, score]) => score > 0)
      .sort(([_, a], [__, b]) => b - a)

    if (sortedIntents.length === 0) {
      return {
        primaryIntent: 'general_eob_literacy',
        secondaryIntents: [],
        confidence: 0.3,
        clarificationNeeded: true,
        suggestedQuestion: 'Could you describe what specific issue you\'re having with your medical bill or insurance?'
      }
    }

    const primaryIntent = sortedIntents[0][0]
    const primaryScore = sortedIntents[0][1]
    const secondaryIntents = sortedIntents.slice(1, 3).map(([id, _]) => id)

    const confidence = Math.min(primaryScore / 10, 1.0)

    const needsClarification = this.needsClarification(
      primaryIntent,
      caseInput,
      confidence
    )

    return {
      primaryIntent,
      secondaryIntents,
      confidence,
      clarificationNeeded: needsClarification.needed,
      suggestedQuestion: needsClarification.question
    }
  }

  private static needsClarification(
    intentId: string,
    caseInput: ChatCaseInput,
    confidence: number
  ): { needed: boolean; question?: string } {
    if (confidence < 0.6) {
      return {
        needed: true,
        question: 'Could you provide more details about your specific billing issue?'
      }
    }

    const intent = this.intents.find(i => i.id === intentId)
    if (!intent) return { needed: false }

    if (intent.requiresDocuments && caseInput.images.length === 0) {
      return {
        needed: true,
        question: 'To better help you, could you upload your medical bill or EOB?'
      }
    }

    if (intent.requiresBenefits && !caseInput.benefits) {
      return {
        needed: true,
        question: 'Understanding your insurance benefits would help me give more accurate guidance. Do you know your deductible and coinsurance percentages?'
      }
    }

    if (intentId === 'surprise_billing' && caseInput.extracted.lines.length === 0) {
      return {
        needed: true,
        question: 'Was this at an in-network hospital or facility?'
      }
    }

    if (intentId === 'eob_bill_mismatch' && caseInput.images.length < 2) {
      return {
        needed: true,
        question: 'To compare the EOB and bill, I\'d need to see both documents. Could you upload both?'
      }
    }

    if (intentId === 'preventive_coding') {
      const hasPreventiveServices = caseInput.extracted.lines.some(line =>
        line.description?.toLowerCase().includes('preventive') ||
        line.description?.toLowerCase().includes('screening') ||
        line.description?.toLowerCase().includes('wellness')
      )

      if (!hasPreventiveServices) {
        return {
          needed: true,
          question: 'What type of preventive service was this for? (e.g., annual physical, mammogram, colonoscopy)'
        }
      }
    }

    return { needed: false }
  }

  static getIntentDescription(intentId: string): string {
    const intent = this.intents.find(i => i.id === intentId)
    return intent?.description || 'General healthcare billing question'
  }

  static getIntentRequirements(intentId: string): { documents: boolean; benefits: boolean } {
    const intent = this.intents.find(i => i.id === intentId)
    return {
      documents: intent?.requiresDocuments || false,
      benefits: intent?.requiresBenefits || false
    }
  }

  static suggestMissingInfo(caseInput: ChatCaseInput, intentId: string): string[] {
    const suggestions: string[] = []
    const intent = this.intents.find(i => i.id === intentId)

    if (!intent) return suggestions

    if (intent.requiresDocuments && caseInput.images.length === 0) {
      suggestions.push('Upload your medical bill or EOB for detailed analysis')
    }

    if (intent.requiresBenefits && !caseInput.benefits) {
      suggestions.push('Provide your insurance benefit details (deductible, coinsurance, etc.)')
    }

    if (caseInput.extracted.lines.length === 0 && caseInput.images.length > 0) {
      suggestions.push('The document quality may be too low for analysis - consider uploading a clearer image')
    }

    return suggestions
  }
}