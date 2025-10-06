import { ProcessedImage, ExtractedData, LineItem } from './image-processor'
import { BenefitsData } from './validations'

export interface ChatCaseInput {
  images: {
    artifactId: string
    mime: string
    width: number
    height: number
    ocrConf: number
  }[]
  extracted: {
    header: {
      providerName?: string
      NPI?: string
      TIN?: string
      payer?: string
      claimId?: string
      accountId?: string
      serviceDates?: string[]
    }
    totals: {
      billed?: number
      allowed?: number
      planPaid?: number
      patientResp?: number
    }
    lines: LineItem[]
    remarks: {
      carcRarc?: string[]
      denialText?: string[]
      freeText?: string[]
    }
    appeal?: {
      address?: string
      deadlineDateISO?: string
    }
  }
  narrative: {
    text: string
    tags?: string[]
  }
  benefits?: {
    planType?: "HMO" | "PPO" | "EPO" | "HDHP" | "Other"
    network?: "IN" | "OUT" | "Unknown"
    deductible?: {
      individual?: number
      family?: number
      met?: number
    }
    coinsurance?: number
    copays?: { [svc: string]: number }
    oopMax?: {
      individual?: number
      family?: number
      met?: number
    }
    secondaryCoverage?: boolean
    priorAuthRequired?: boolean
    referralRequired?: boolean
  }
}

export class CaseFusion {
  static fuseCase(
    processedImages: ProcessedImage[],
    narrative: string,
    benefits?: BenefitsData
  ): ChatCaseInput {

    const images = processedImages.map(img => ({
      artifactId: img.artifactId,
      mime: img.mime,
      width: img.width,
      height: img.height,
      ocrConf: img.ocrConf
    }))

    const fusedExtracted = this.fuseExtractedData(processedImages.map(img => img.extractedData))

    const narrativeTags = this.extractNarrativeTags(narrative)

    const normalizedBenefits = this.normalizeBenefits(benefits)

    return {
      images,
      extracted: fusedExtracted,
      narrative: {
        text: narrative,
        tags: narrativeTags
      },
      benefits: normalizedBenefits
    }
  }

  private static fuseExtractedData(extractedDataList: ExtractedData[]): ChatCaseInput['extracted'] {
    const fused: ChatCaseInput['extracted'] = {
      header: {},
      totals: {},
      lines: [],
      remarks: {
        carcRarc: [],
        denialText: [],
        freeText: []
      }
    }

    for (const data of extractedDataList) {
      this.mergeHeader(fused.header, data.header)
      this.mergeTotals(fused.totals, data.totals)
      this.mergeLines(fused.lines, data.lines)
      this.mergeRemarks(fused.remarks, data.remarks)
      this.mergeAppeal(fused, data.appeal)
    }

    this.deduplicateLines(fused.lines)

    return fused
  }

  private static mergeHeader(target: any, source: any): void {
    Object.keys(source).forEach(key => {
      if (source[key] && !target[key]) {
        target[key] = source[key]
      } else if (key === 'serviceDates' && source[key] && target[key]) {
        target[key] = Array.from(new Set([...target[key], ...source[key]]))
      }
    })
  }

  private static mergeTotals(target: any, source: any): void {
    Object.keys(source).forEach(key => {
      if (source[key] && !target[key]) {
        target[key] = source[key]
      } else if (source[key] && target[key]) {
        target[key] = Math.max(target[key], source[key])
      }
    })
  }

  private static mergeLines(target: LineItem[], source: LineItem[]): void {
    for (const sourceLine of source) {
      const existing = target.find(line =>
        this.linesMatch(line, sourceLine)
      )

      if (!existing) {
        target.push({
          ...sourceLine,
          lineId: `merged_${target.length}_${sourceLine.lineId}`
        })
      } else {
        this.mergeLine(existing, sourceLine)
      }
    }
  }

  private static linesMatch(line1: LineItem, line2: LineItem): boolean {
    if (line1.code && line2.code && line1.code === line2.code) {
      if (line1.dos && line2.dos && line1.dos === line2.dos) {
        return true
      }

      if (line1.charge && line2.charge &&
          Math.abs(line1.charge - line2.charge) < 0.01) {
        return true
      }
    }

    return false
  }

  private static mergeLine(target: LineItem, source: LineItem): void {
    Object.keys(source).forEach(key => {
      if (source[key as keyof LineItem] && !target[key as keyof LineItem]) {
        (target as any)[key] = (source as any)[key]
      }
    })

    if (source.conf && target.conf) {
      target.conf = Math.max(target.conf, source.conf)
    }
  }

  private static mergeRemarks(target: any, source: any): void {
    if (source.carcRarc) {
      target.carcRarc = Array.from(new Set([...target.carcRarc, ...source.carcRarc]))
    }
    if (source.denialText) {
      target.denialText = Array.from(new Set([...target.denialText, ...source.denialText]))
    }
    if (source.freeText) {
      target.freeText = Array.from(new Set([...target.freeText, ...source.freeText]))
    }
  }

  private static mergeAppeal(target: ChatCaseInput['extracted'], sourceAppeal?: any): void {
    if (sourceAppeal) {
      if (!target.appeal) {
        target.appeal = {}
      }

      if (sourceAppeal.address && !target.appeal.address) {
        target.appeal.address = sourceAppeal.address
      }

      if (sourceAppeal.deadlineDateISO && !target.appeal.deadlineDateISO) {
        target.appeal.deadlineDateISO = sourceAppeal.deadlineDateISO
      }
    }
  }

  private static deduplicateLines(lines: LineItem[]): void {
    const seenCombinations = new Set<string>()
    const duplicateIndices: number[] = []

    lines.forEach((line, index) => {
      const key = `${line.code || 'no-code'}_${line.dos || 'no-dos'}_${line.charge || 'no-charge'}`

      if (seenCombinations.has(key)) {
        duplicateIndices.push(index)
      } else {
        seenCombinations.add(key)
      }
    })

    duplicateIndices.reverse().forEach(index => {
      lines.splice(index, 1)
    })
  }

  private static extractNarrativeTags(narrative: string): string[] {
    const tags: string[] = []
    const lowerNarrative = narrative.toLowerCase()

    const tagPatterns = [
      { pattern: /surprise.{0,20}bill|balance.{0,20}bill/, tag: 'surprise_billing' },
      { pattern: /facility.{0,20}fee/, tag: 'facility_fee' },
      { pattern: /emergency|er |urgent/, tag: 'emergency' },
      { pattern: /preventive|screening|wellness|annual/, tag: 'preventive' },
      { pattern: /out.{0,10}network|oon/, tag: 'out_of_network' },
      { pattern: /prior.{0,10}auth/, tag: 'prior_auth' },
      { pattern: /referral/, tag: 'referral' },
      { pattern: /denied|denial/, tag: 'denial' },
      { pattern: /ambulance/, tag: 'ambulance' },
      { pattern: /newborn|baby/, tag: 'newborn' },
      { pattern: /coordination.{0,10}benefits|cob/, tag: 'coordination_of_benefits' },
      { pattern: /deductible/, tag: 'deductible' },
      { pattern: /coinsurance/, tag: 'coinsurance' },
      { pattern: /copay/, tag: 'copay' },
      { pattern: /appeal/, tag: 'appeal' },
      { pattern: /timely.{0,10}filing/, tag: 'timely_filing' }
    ]

    tagPatterns.forEach(({ pattern, tag }) => {
      if (pattern.test(lowerNarrative)) {
        tags.push(tag)
      }
    })

    return tags
  }

  private static normalizeBenefits(benefits?: BenefitsData): ChatCaseInput['benefits'] | undefined {
    if (!benefits) return undefined

    const normalized: ChatCaseInput['benefits'] = {}

    if (benefits.planType) {
      const planTypeMap: { [key: string]: "HMO" | "PPO" | "EPO" | "HDHP" | "Other" } = {
        'hmo': 'HMO',
        'ppo': 'PPO',
        'epo': 'EPO',
        'hdhp': 'HDHP',
        'high deductible': 'HDHP'
      }
      normalized.planType = planTypeMap[benefits.planType.toLowerCase()] || 'Other'
    }

    if (benefits.deductible !== undefined) {
      normalized.deductible = {
        individual: benefits.deductible
      }

      if (benefits.deductibleMet === 'fully_met') {
        normalized.deductible.met = benefits.deductible
      } else if (benefits.deductibleMet === 'partially_met' && benefits.amountPaidToDeductible) {
        normalized.deductible.met = benefits.amountPaidToDeductible
      } else {
        normalized.deductible.met = 0
      }
    }

    if (benefits.coinsurance !== undefined) {
      normalized.coinsurance = benefits.coinsurance
    }

    if (benefits.copay !== undefined) {
      normalized.copays = {
        'office_visit': benefits.copay
      }
    }

    if (benefits.oopMax !== undefined) {
      normalized.oopMax = {
        individual: benefits.oopMax
      }
    }

    normalized.network = 'Unknown'
    normalized.secondaryCoverage = false
    normalized.priorAuthRequired = false
    normalized.referralRequired = false

    return normalized
  }

  static joinBillAndEOB(
    billData: ExtractedData,
    eobData: ExtractedData
  ): ExtractedData {
    const joined: ExtractedData = {
      header: { ...billData.header, ...eobData.header },
      totals: { ...billData.totals, ...eobData.totals },
      lines: [],
      remarks: {
        carcRarc: [
          ...(billData.remarks.carcRarc || []),
          ...(eobData.remarks.carcRarc || [])
        ],
        denialText: [
          ...(billData.remarks.denialText || []),
          ...(eobData.remarks.denialText || [])
        ],
        freeText: [
          ...(billData.remarks.freeText || []),
          ...(eobData.remarks.freeText || [])
        ]
      },
      appeal: billData.appeal || eobData.appeal
    }

    const allLines = [...billData.lines, ...eobData.lines]

    for (const line of allLines) {
      const existing = joined.lines.find(existingLine =>
        this.linesMatch(existingLine, line)
      )

      if (!existing) {
        joined.lines.push({ ...line })
      } else {
        this.mergeLine(existing, line)
      }
    }

    return joined
  }
}