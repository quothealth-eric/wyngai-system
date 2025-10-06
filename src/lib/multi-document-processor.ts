import { ImageProcessor } from './image-processor'

export interface DocumentEntity {
  type: 'provider' | 'payer' | 'member' | 'claim' | 'amount' | 'date' | 'code'
  value: string
  confidence: number
  source: string
  context?: string
}

export interface ExtractedDocumentData {
  documentType: 'EOB' | 'Bill' | 'SBC' | 'Denial' | 'Prior_Auth' | 'Appeal' | 'Insurance_Card' | 'Unknown'
  entities: DocumentEntity[]
  codes: {
    cpt?: string[]
    icd10?: string[]
    ndc?: string[]
    hcpcs?: string[]
    drg?: string[]
  }
  planIdentifiers: {
    memberId?: string
    groupNumber?: string
    planName?: string
    payerId?: string
    bin?: string
    pcn?: string
  }
  dates: {
    serviceDate?: string[]
    statementDate?: string
    dueDate?: string
    appealDeadline?: string
  }
  amounts: {
    totalBilled?: number
    allowedAmount?: number
    planPaid?: number
    patientResponsibility?: number
    deductibleApplied?: number
    coinsuranceApplied?: number
    copayApplied?: number
  }
  networkInfo: {
    providerStatus?: 'in-network' | 'out-of-network' | 'unknown'
    tierLevel?: string
    facilityType?: string
  }
  appealInfo?: {
    denialReason?: string[]
    appealLevels?: string[]
    deadlines?: string[]
    contactInfo?: string
  }
  rawText: string
  confidence: number
}

export interface SessionContext {
  sessionId: string
  documents: ExtractedDocumentData[]
  planContext?: {
    planType?: 'Individual' | 'Employer' | 'COBRA' | 'Medicaid' | 'CHIP' | 'Medicare'
    metalTier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
    networkType?: 'HMO' | 'PPO' | 'EPO' | 'POS'
    state?: string
    effectiveDate?: string
  }
  memberInfo?: {
    memberId?: string
    dependents?: string[]
    primaryInsurance?: boolean
  }
  extractedFacts: string[]
  lastUpdated: Date
}

export class MultiDocumentProcessor {
  static async parseDocuments(files: File[]): Promise<ExtractedDocumentData[]> {
    console.log(`📄 Processing ${files.length} documents for multi-document analysis`)

    const results: ExtractedDocumentData[] = []

    for (const file of files) {
      try {
        const processedDoc = await this.processDocument(file)
        results.push(processedDoc)
        console.log(`✅ Processed ${file.name}: ${processedDoc.documentType} (confidence: ${processedDoc.confidence.toFixed(2)})`)
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error)
        // Create a minimal result for failed processing
        results.push({
          documentType: 'Unknown',
          entities: [],
          codes: {},
          planIdentifiers: {},
          dates: {},
          amounts: {},
          networkInfo: {},
          rawText: '',
          confidence: 0
        })
      }
    }

    return results
  }

  private static async processDocument(file: File): Promise<ExtractedDocumentData> {
    let text = ''
    let confidence = 0

    if (file.type === 'application/pdf') {
      // For PDF files, we'll need to extract text
      // For now, use basic OCR approach
      const processedImage = await ImageProcessor.processImage(file)
      text = processedImage.ocrText
      confidence = processedImage.ocrConf / 100
    } else if (file.type.startsWith('image/')) {
      const processedImage = await ImageProcessor.processImage(file)
      text = processedImage.ocrText
      confidence = processedImage.ocrConf / 100
    } else {
      throw new Error(`Unsupported file type: ${file.type}`)
    }

    const documentType = this.identifyDocumentType(text)
    const entities = this.extractEntities(text, documentType)
    const codes = this.extractCodes(text)
    const planIdentifiers = this.extractPlanIdentifiers(text)
    const dates = this.extractDates(text)
    const amounts = this.extractAmounts(text)
    const networkInfo = this.extractNetworkInfo(text)
    const appealInfo = this.extractAppealInfo(text, documentType)

    return {
      documentType,
      entities,
      codes,
      planIdentifiers,
      dates,
      amounts,
      networkInfo,
      appealInfo,
      rawText: text,
      confidence
    }
  }

  private static identifyDocumentType(text: string): ExtractedDocumentData['documentType'] {
    const lowerText = text.toLowerCase()

    // EOB identification
    if (lowerText.includes('explanation of benefits') ||
        lowerText.includes('this is not a bill') ||
        (lowerText.includes('claim') && lowerText.includes('processed'))) {
      return 'EOB'
    }

    // Bill identification
    if (lowerText.includes('statement') && lowerText.includes('amount due') ||
        lowerText.includes('patient responsibility') ||
        lowerText.includes('balance') && lowerText.includes('due')) {
      return 'Bill'
    }

    // SBC identification
    if (lowerText.includes('summary of benefits and coverage') ||
        lowerText.includes('coverage examples') ||
        lowerText.includes('plan year deductible')) {
      return 'SBC'
    }

    // Denial letter identification
    if (lowerText.includes('denial') || lowerText.includes('not covered') ||
        lowerText.includes('claim denied') || lowerText.includes('adverse determination')) {
      return 'Denial'
    }

    // Prior authorization identification
    if (lowerText.includes('prior authorization') || lowerText.includes('pre-authorization') ||
        lowerText.includes('prior auth') || lowerText.includes('precertification')) {
      return 'Prior_Auth'
    }

    // Appeal documentation
    if (lowerText.includes('appeal') && (lowerText.includes('request') || lowerText.includes('response'))) {
      return 'Appeal'
    }

    // Insurance card identification
    if (lowerText.includes('member id') && lowerText.includes('group') ||
        lowerText.includes('effective date') && lowerText.includes('plan')) {
      return 'Insurance_Card'
    }

    return 'Unknown'
  }

  private static extractEntities(text: string, documentType: string): DocumentEntity[] {
    const entities: DocumentEntity[] = []

    // Provider names
    const providerPatterns = [
      /(?:provider|facility|hospital|clinic|medical center)[:\s]+([A-Za-z\s&,]+)/gi,
      /^([A-Z][a-z]+\s+(?:Medical|Hospital|Clinic|Health|Healthcare)[A-Za-z\s]*)/gm
    ]

    for (const pattern of providerPatterns) {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 3) {
          entities.push({
            type: 'provider',
            value: match[1].trim(),
            confidence: 0.8,
            source: 'pattern_match',
            context: 'provider_identification'
          })
        }
      }
    }

    // Payer/Insurance company names
    const payerPatterns = [
      /(?:insurance|payer|plan)[:\s]+([A-Za-z\s&,]+)/gi,
      /(Aetna|Anthem|Blue Cross|Blue Shield|Cigna|Humana|UnitedHealth|Kaiser)/gi
    ]

    for (const pattern of payerPatterns) {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        const value = match[1] || match[0]
        if (value && value.trim().length > 2) {
          entities.push({
            type: 'payer',
            value: value.trim(),
            confidence: 0.9,
            source: 'pattern_match',
            context: 'payer_identification'
          })
        }
      }
    }

    // Member information
    const memberPatterns = [
      /member[:\s]+([A-Za-z\s,]+)/gi,
      /patient[:\s]+([A-Za-z\s,]+)/gi,
      /subscriber[:\s]+([A-Za-z\s,]+)/gi
    ]

    for (const pattern of memberPatterns) {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 2) {
          entities.push({
            type: 'member',
            value: match[1].trim(),
            confidence: 0.7,
            source: 'pattern_match',
            context: 'member_identification'
          })
        }
      }
    }

    // Claim numbers
    const claimPatterns = [
      /claim[#\s]*([A-Z0-9-]+)/gi,
      /reference[#\s]*([A-Z0-9-]+)/gi
    ]

    for (const pattern of claimPatterns) {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        if (match[1] && match[1].length > 3) {
          entities.push({
            type: 'claim',
            value: match[1],
            confidence: 0.9,
            source: 'pattern_match',
            context: 'claim_identification'
          })
        }
      }
    }

    return entities
  }

  private static extractCodes(text: string): ExtractedDocumentData['codes'] {
    const codes: ExtractedDocumentData['codes'] = {}

    // CPT codes (5 digits)
    const cptMatches = text.match(/\b\d{5}\b/g)
    if (cptMatches) {
      codes.cpt = Array.from(new Set(cptMatches))
    }

    // HCPCS codes (letter followed by 4 digits)
    const hcpcsMatches = text.match(/\b[A-Z]\d{4}\b/g)
    if (hcpcsMatches) {
      codes.hcpcs = Array.from(new Set(hcpcsMatches))
    }

    // ICD-10 codes (letter followed by digits and possible decimal)
    const icd10Matches = text.match(/\b[A-Z]\d{2}(?:\.\d+)?\b/g)
    if (icd10Matches) {
      codes.icd10 = Array.from(new Set(icd10Matches))
    }

    // NDC codes (drug codes)
    const ndcMatches = text.match(/\b\d{4,5}-\d{3,4}-\d{2}\b/g)
    if (ndcMatches) {
      codes.ndc = Array.from(new Set(ndcMatches))
    }

    // DRG codes
    const drgMatches = text.match(/DRG[:\s]*(\d{3})/gi)
    if (drgMatches) {
      codes.drg = Array.from(new Set(drgMatches.map(match => match.split(/[:\s]+/)[1])))
    }

    return codes
  }

  private static extractPlanIdentifiers(text: string): ExtractedDocumentData['planIdentifiers'] {
    const identifiers: ExtractedDocumentData['planIdentifiers'] = {}

    // Member ID patterns
    const memberIdPattern = /member[#\s]*id[:\s]*([A-Z0-9-]+)/gi
    const memberIdMatch = memberIdPattern.exec(text)
    if (memberIdMatch) {
      identifiers.memberId = memberIdMatch[1]
    }

    // Group number
    const groupPattern = /group[#\s]*(?:number)?[:\s]*([A-Z0-9-]+)/gi
    const groupMatch = groupPattern.exec(text)
    if (groupMatch) {
      identifiers.groupNumber = groupMatch[1]
    }

    // Plan name
    const planPattern = /plan[:\s]+([A-Za-z0-9\s-]+)/gi
    const planMatch = planPattern.exec(text)
    if (planMatch) {
      identifiers.planName = planMatch[1].trim()
    }

    // BIN/PCN for pharmacy cards
    const binPattern = /BIN[:\s]*(\d+)/gi
    const binMatch = binPattern.exec(text)
    if (binMatch) {
      identifiers.bin = binMatch[1]
    }

    const pcnPattern = /PCN[:\s]*([A-Z0-9]+)/gi
    const pcnMatch = pcnPattern.exec(text)
    if (pcnMatch) {
      identifiers.pcn = pcnMatch[1]
    }

    return identifiers
  }

  private static extractDates(text: string): ExtractedDocumentData['dates'] {
    const dates: ExtractedDocumentData['dates'] = {}

    // Common date patterns
    const datePatterns = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g,
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g
    ]

    const allDates: string[] = []
    for (const pattern of datePatterns) {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        allDates.push(match[0])
      }
    }

    // Service date patterns
    const serviceDatePattern = /service[:\s]*date[:\s]*([0-9\/\-]+)/gi
    const serviceDateMatch = serviceDatePattern.exec(text)
    if (serviceDateMatch) {
      dates.serviceDate = [serviceDateMatch[1]]
    } else if (allDates.length > 0) {
      dates.serviceDate = allDates.slice(0, 3) // Take first few dates as potential service dates
    }

    // Statement date
    const statementPattern = /statement[:\s]*date[:\s]*([0-9\/\-]+)/gi
    const statementMatch = statementPattern.exec(text)
    if (statementMatch) {
      dates.statementDate = statementMatch[1]
    }

    // Due date
    const duePattern = /due[:\s]*(?:date)?[:\s]*([0-9\/\-]+)/gi
    const dueMatch = duePattern.exec(text)
    if (dueMatch) {
      dates.dueDate = dueMatch[1]
    }

    // Appeal deadline
    const appealPattern = /appeal[:\s]*(?:by|deadline)[:\s]*([0-9\/\-]+)/gi
    const appealMatch = appealPattern.exec(text)
    if (appealMatch) {
      dates.appealDeadline = appealMatch[1]
    }

    return dates
  }

  private static extractAmounts(text: string): ExtractedDocumentData['amounts'] {
    const amounts: ExtractedDocumentData['amounts'] = {}

    // Amount patterns
    const amountPattern = /\$?([\d,]+\.?\d*)/g

    // Specific amount types
    const patterns = [
      { key: 'totalBilled', patterns: [/total[:\s]*(?:billed|charge)[:\s]*\$?([\d,]+\.?\d*)/gi, /billed[:\s]*amount[:\s]*\$?([\d,]+\.?\d*)/gi] },
      { key: 'allowedAmount', patterns: [/allowed[:\s]*amount[:\s]*\$?([\d,]+\.?\d*)/gi, /approved[:\s]*amount[:\s]*\$?([\d,]+\.?\d*)/gi] },
      { key: 'planPaid', patterns: [/(?:plan|insurance)[:\s]*paid[:\s]*\$?([\d,]+\.?\d*)/gi, /benefit[:\s]*amount[:\s]*\$?([\d,]+\.?\d*)/gi] },
      { key: 'patientResponsibility', patterns: [/patient[:\s]*(?:responsibility|owes?)[:\s]*\$?([\d,]+\.?\d*)/gi, /amount[:\s]*due[:\s]*\$?([\d,]+\.?\d*)/gi] },
      { key: 'deductibleApplied', patterns: [/deductible[:\s]*(?:applied|amount)[:\s]*\$?([\d,]+\.?\d*)/gi] },
      { key: 'coinsuranceApplied', patterns: [/coinsurance[:\s]*(?:applied|amount)[:\s]*\$?([\d,]+\.?\d*)/gi] },
      { key: 'copayApplied', patterns: [/copay(?:ment)?[:\s]*(?:applied|amount)[:\s]*\$?([\d,]+\.?\d*)/gi] }
    ]

    for (const { key, patterns: patternList } of patterns) {
      for (const pattern of patternList) {
        const match = pattern.exec(text)
        if (match) {
          const value = parseFloat(match[1].replace(/,/g, ''))
          if (!isNaN(value)) {
            (amounts as any)[key] = value
            break
          }
        }
      }
    }

    return amounts
  }

  private static extractNetworkInfo(text: string): ExtractedDocumentData['networkInfo'] {
    const networkInfo: ExtractedDocumentData['networkInfo'] = {}

    // Network status
    if (text.toLowerCase().includes('in-network') || text.toLowerCase().includes('participating')) {
      networkInfo.providerStatus = 'in-network'
    } else if (text.toLowerCase().includes('out-of-network') || text.toLowerCase().includes('non-participating')) {
      networkInfo.providerStatus = 'out-of-network'
    } else {
      networkInfo.providerStatus = 'unknown'
    }

    // Tier level
    const tierPattern = /tier[:\s]*(\d+|one|two|three|four)/gi
    const tierMatch = tierPattern.exec(text)
    if (tierMatch) {
      networkInfo.tierLevel = tierMatch[1]
    }

    // Facility type
    const facilityTypes = ['hospital', 'clinic', 'urgent care', 'emergency', 'outpatient', 'inpatient']
    for (const type of facilityTypes) {
      if (text.toLowerCase().includes(type)) {
        networkInfo.facilityType = type
        break
      }
    }

    return networkInfo
  }

  private static extractAppealInfo(text: string, documentType: string): ExtractedDocumentData['appealInfo'] | undefined {
    if (documentType !== 'Denial' && documentType !== 'Appeal') {
      return undefined
    }

    const appealInfo: ExtractedDocumentData['appealInfo'] = {}

    // Denial reasons
    const denialPatterns = [
      /denied[:\s]*(?:because|reason)[:\s]*([^.]+)/gi,
      /not covered[:\s]*(?:because)?[:\s]*([^.]+)/gi,
      /reason[:\s]*for[:\s]*denial[:\s]*([^.]+)/gi
    ]

    appealInfo.denialReason = []
    for (const pattern of denialPatterns) {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 5) {
          appealInfo.denialReason.push(match[1].trim())
        }
      }
    }

    // Appeal levels
    const levelPattern = /(?:first|second|external)[:\s]*(?:level[:\s]*)?appeal/gi
    const levelMatches = text.matchAll(levelPattern)
    appealInfo.appealLevels = Array.from(levelMatches).map(match => match[0])

    // Deadlines
    const deadlinePattern = /appeal[:\s]*(?:within|by)[:\s]*(\d+)[:\s]*days?/gi
    const deadlineMatches = text.matchAll(deadlinePattern)
    appealInfo.deadlines = Array.from(deadlineMatches).map(match => `${match[1]} days`)

    // Contact information
    const contactPattern = /(?:appeal|contact)[:\s]*(?:to|at)?[:\s]*([^.]+)/gi
    const contactMatch = contactPattern.exec(text)
    if (contactMatch) {
      appealInfo.contactInfo = contactMatch[1].trim()
    }

    return appealInfo
  }

  static createSessionContext(
    sessionId: string,
    documents: ExtractedDocumentData[],
    userContext?: Partial<SessionContext['planContext']>
  ): SessionContext {
    // Infer plan context from documents
    const planContext = this.inferPlanContext(documents, userContext)

    // Extract member info
    const memberInfo = this.extractMemberInfo(documents)

    // Generate extracted facts
    const extractedFacts = this.generateExtractedFacts(documents)

    return {
      sessionId,
      documents,
      planContext,
      memberInfo,
      extractedFacts,
      lastUpdated: new Date()
    }
  }

  private static inferPlanContext(
    documents: ExtractedDocumentData[],
    userContext?: Partial<SessionContext['planContext']>
  ): SessionContext['planContext'] {
    const context: SessionContext['planContext'] = { ...userContext }

    // Try to infer from document content
    for (const doc of documents) {
      if (doc.planIdentifiers.planName) {
        const planName = doc.planIdentifiers.planName.toLowerCase()

        if (planName.includes('hmo')) {
          context.networkType = 'HMO'
        } else if (planName.includes('ppo')) {
          context.networkType = 'PPO'
        } else if (planName.includes('epo')) {
          context.networkType = 'EPO'
        }

        if (planName.includes('bronze')) {
          context.metalTier = 'Bronze'
        } else if (planName.includes('silver')) {
          context.metalTier = 'Silver'
        } else if (planName.includes('gold')) {
          context.metalTier = 'Gold'
        } else if (planName.includes('platinum')) {
          context.metalTier = 'Platinum'
        }
      }

      // Try to infer plan type from entities
      for (const entity of doc.entities) {
        if (entity.type === 'payer' && entity.value.toLowerCase().includes('medicaid')) {
          context.planType = 'Medicaid'
        } else if (entity.value.toLowerCase().includes('medicare')) {
          context.planType = 'Medicare'
        }
      }
    }

    return context
  }

  private static extractMemberInfo(documents: ExtractedDocumentData[]): SessionContext['memberInfo'] {
    const memberInfo: SessionContext['memberInfo'] = {}

    for (const doc of documents) {
      if (doc.planIdentifiers.memberId && !memberInfo.memberId) {
        memberInfo.memberId = doc.planIdentifiers.memberId
      }

      // Look for dependent information in entities
      for (const entity of doc.entities) {
        if (entity.type === 'member' && entity.context === 'dependent') {
          memberInfo.dependents = memberInfo.dependents || []
          if (!memberInfo.dependents.includes(entity.value)) {
            memberInfo.dependents.push(entity.value)
          }
        }
      }
    }

    return memberInfo
  }

  private static generateExtractedFacts(documents: ExtractedDocumentData[]): string[] {
    const facts: string[] = []

    for (const doc of documents) {
      // Add document type fact
      facts.push(`Document type identified: ${doc.documentType}`)

      // Add plan facts
      if (doc.planIdentifiers.planName) {
        facts.push(`Plan: ${doc.planIdentifiers.planName}`)
      }

      if (doc.planIdentifiers.memberId) {
        facts.push(`Member ID: ${doc.planIdentifiers.memberId}`)
      }

      // Add amount facts
      if (doc.amounts.totalBilled) {
        facts.push(`Total billed: $${doc.amounts.totalBilled.toLocaleString()}`)
      }

      if (doc.amounts.patientResponsibility) {
        facts.push(`Patient responsibility: $${doc.amounts.patientResponsibility.toLocaleString()}`)
      }

      // Add network facts
      if (doc.networkInfo.providerStatus) {
        facts.push(`Provider network status: ${doc.networkInfo.providerStatus}`)
      }

      // Add code facts
      if (doc.codes.cpt && doc.codes.cpt.length > 0) {
        facts.push(`CPT codes found: ${doc.codes.cpt.join(', ')}`)
      }

      // Add date facts
      if (doc.dates.serviceDate) {
        facts.push(`Service date(s): ${doc.dates.serviceDate.join(', ')}`)
      }

      // Add appeal facts
      if (doc.appealInfo?.denialReason) {
        facts.push(`Denial reason(s): ${doc.appealInfo.denialReason.join('; ')}`)
      }
    }

    return facts
  }

  static getPlanRules(planId: string, state: string, date: string): any {
    // Placeholder for plan rules retrieval
    // This would integrate with the plan database/SBC repository
    return {
      costShare: {},
      paReferral: {},
      networkTier: {},
      exclusions: {}
    }
  }

  static getAppealSteps(payer: string, productLine: string, denialReason: string): any {
    // Placeholder for appeal steps retrieval
    // This would integrate with the payer policy database
    return {
      levels: [],
      deadlines: [],
      templates: []
    }
  }

  private static identifyDocumentType(text: string): ExtractedDocumentData['documentType'] {
    const lowerText = text.toLowerCase()

    if (lowerText.includes('explanation of benefits') || lowerText.includes('this is not a bill')) {
      return 'EOB'
    }
    if (lowerText.includes('statement') && lowerText.includes('amount due')) {
      return 'Bill'
    }
    if (lowerText.includes('summary of benefits') && lowerText.includes('coverage')) {
      return 'SBC'
    }
    if (lowerText.includes('denied') || lowerText.includes('not covered')) {
      return 'Denial'
    }
    if (lowerText.includes('prior authorization') || lowerText.includes('pre-approval')) {
      return 'Prior_Auth'
    }
    if (lowerText.includes('appeal') || lowerText.includes('grievance')) {
      return 'Appeal'
    }
    if (lowerText.includes('member id') && lowerText.includes('group number')) {
      return 'Insurance_Card'
    }

    return 'Unknown'
  }

  private static extractEntities(text: string, documentType: ExtractedDocumentData['documentType']): DocumentEntity[] {
    const entities: DocumentEntity[] = []

    // Provider patterns
    const providerPatterns = [
      /provider\s*[:]\s*([^\n\r]+)/gi,
      /rendered\s+by\s*[:]\s*([^\n\r]+)/gi,
      /doctor\s*[:]\s*([^\n\r]+)/gi,
      /facility\s*[:]\s*([^\n\r]+)/gi
    ]

    providerPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        entities.push({
          type: 'provider',
          value: match[1].trim(),
          confidence: 0.8,
          source: 'regex_pattern',
          context: 'provider_identification'
        })
      }
    })

    // Payer patterns
    const payerPatterns = [
      /insurance\s+company\s*[:]\s*([^\n\r]+)/gi,
      /plan\s+name\s*[:]\s*([^\n\r]+)/gi,
      /carrier\s*[:]\s*([^\n\r]+)/gi
    ]

    payerPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        entities.push({
          type: 'payer',
          value: match[1].trim(),
          confidence: 0.8,
          source: 'regex_pattern',
          context: 'payer_identification'
        })
      }
    })

    // Member patterns
    const memberPatterns = [
      /member\s*[:]\s*([^\n\r]+)/gi,
      /patient\s*[:]\s*([^\n\r]+)/gi,
      /subscriber\s*[:]\s*([^\n\r]+)/gi
    ]

    memberPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        entities.push({
          type: 'member',
          value: match[1].trim(),
          confidence: 0.7,
          source: 'regex_pattern',
          context: 'member_identification'
        })
      }
    })

    // Claim patterns
    const claimPatterns = [
      /claim\s+(?:number|id)\s*[:]\s*([A-Z0-9\-]+)/gi,
      /reference\s+(?:number|id)\s*[:]\s*([A-Z0-9\-]+)/gi
    ]

    claimPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        entities.push({
          type: 'claim',
          value: match[1].trim(),
          confidence: 0.9,
          source: 'regex_pattern',
          context: 'claim_identification'
        })
      }
    })

    return entities
  }

  private static extractCodes(text: string): ExtractedDocumentData['codes'] {
    const codes: ExtractedDocumentData['codes'] = {}

    // CPT codes (5 digits)
    const cptMatches = text.match(/\b\d{5}\b/g)
    if (cptMatches) {
      codes.cpt = Array.from(new Set(cptMatches))
    }

    // ICD-10 codes (pattern: Letter + 2-3 digits + optional decimal + 1-4 alphanumeric)
    const icd10Matches = text.match(/\b[A-Z]\d{2,3}(?:\.\d{1,4})?[A-Z0-9]?\b/g)
    if (icd10Matches) {
      codes.icd10 = Array.from(new Set(icd10Matches))
    }

    // NDC codes (various formats)
    const ndcMatches = text.match(/\b\d{4,5}-\d{3,4}-\d{1,2}\b|\b\d{10,11}\b/g)
    if (ndcMatches) {
      codes.ndc = Array.from(new Set(ndcMatches))
    }

    // HCPCS codes (Letter + 4 digits)
    const hcpcsMatches = text.match(/\b[A-Z]\d{4}\b/g)
    if (hcpcsMatches) {
      codes.hcpcs = Array.from(new Set(hcpcsMatches))
    }

    // DRG codes (3 digits)
    const drgMatches = text.match(/DRG\s*[:]\s*(\d{3})/gi)
    if (drgMatches) {
      codes.drg = drgMatches.map(match => match.split(':')[1].trim())
    }

    return codes
  }

  private static extractPlanIdentifiers(text: string): ExtractedDocumentData['planIdentifiers'] {
    const identifiers: ExtractedDocumentData['planIdentifiers'] = {}

    // Member ID patterns
    const memberIdMatch = text.match(/member\s+(?:id|number)\s*[:]\s*([A-Z0-9\-]+)/gi)
    if (memberIdMatch) {
      identifiers.memberId = memberIdMatch[0].split(':')[1].trim()
    }

    // Group number patterns
    const groupMatch = text.match(/group\s+(?:number|id)\s*[:]\s*([A-Z0-9\-]+)/gi)
    if (groupMatch) {
      identifiers.groupNumber = groupMatch[0].split(':')[1].trim()
    }

    // Plan name patterns
    const planMatch = text.match(/plan\s+name\s*[:]\s*([^\n\r]+)/gi)
    if (planMatch) {
      identifiers.planName = planMatch[0].split(':')[1].trim()
    }

    // Payer ID patterns
    const payerMatch = text.match(/payer\s+(?:id|number)\s*[:]\s*([A-Z0-9\-]+)/gi)
    if (payerMatch) {
      identifiers.payerId = payerMatch[0].split(':')[1].trim()
    }

    // BIN/PCN for pharmacy benefits
    const binMatch = text.match(/BIN\s*[:]\s*(\d{6})/gi)
    if (binMatch) {
      identifiers.bin = binMatch[0].split(':')[1].trim()
    }

    const pcnMatch = text.match(/PCN\s*[:]\s*([A-Z0-9]+)/gi)
    if (pcnMatch) {
      identifiers.pcn = pcnMatch[0].split(':')[1].trim()
    }

    return identifiers
  }

  private static extractDates(text: string): ExtractedDocumentData['dates'] {
    const dates: ExtractedDocumentData['dates'] = {}

    // Service date patterns
    const serviceDateMatches = text.match(/(?:service|date\s+of\s+service)\s*[:]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi)
    if (serviceDateMatches) {
      dates.serviceDate = serviceDateMatches.map(match => match.split(':')[1].trim())
    }

    // Statement date
    const statementMatch = text.match(/(?:statement|bill)\s+date\s*[:]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi)
    if (statementMatch) {
      dates.statementDate = statementMatch[0].split(':')[1].trim()
    }

    // Due date
    const dueMatch = text.match(/(?:due|payment\s+due)\s+date\s*[:]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi)
    if (dueMatch) {
      dates.dueDate = dueMatch[0].split(':')[1].trim()
    }

    // Appeal deadline
    const appealMatch = text.match(/appeal\s+(?:deadline|by)\s*[:]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi)
    if (appealMatch) {
      dates.appealDeadline = appealMatch[0].split(':')[1].trim()
    }

    return dates
  }

  private static extractAmounts(text: string): ExtractedDocumentData['amounts'] {
    const amounts: ExtractedDocumentData['amounts'] = {}

    // Total billed amount
    const billedMatch = text.match(/(?:total\s+)?(?:billed|charges?)\s*[:]\s*\$?([\d,]+\.?\d*)/gi)
    if (billedMatch) {
      amounts.totalBilled = parseFloat(billedMatch[0].split(/[:$]/)[1].replace(/,/g, ''))
    }

    // Allowed amount
    const allowedMatch = text.match(/allowed\s+amount\s*[:]\s*\$?([\d,]+\.?\d*)/gi)
    if (allowedMatch) {
      amounts.allowedAmount = parseFloat(allowedMatch[0].split(/[:$]/)[1].replace(/,/g, ''))
    }

    // Plan paid
    const planPaidMatch = text.match(/(?:plan|insurance)\s+paid\s*[:]\s*\$?([\d,]+\.?\d*)/gi)
    if (planPaidMatch) {
      amounts.planPaid = parseFloat(planPaidMatch[0].split(/[:$]/)[1].replace(/,/g, ''))
    }

    // Patient responsibility
    const patientMatch = text.match(/(?:patient\s+)?(?:responsibility|owes?|balance)\s*[:]\s*\$?([\d,]+\.?\d*)/gi)
    if (patientMatch) {
      amounts.patientResponsibility = parseFloat(patientMatch[0].split(/[:$]/)[1].replace(/,/g, ''))
    }

    // Deductible applied
    const deductibleMatch = text.match(/deductible\s+applied\s*[:]\s*\$?([\d,]+\.?\d*)/gi)
    if (deductibleMatch) {
      amounts.deductibleApplied = parseFloat(deductibleMatch[0].split(/[:$]/)[1].replace(/,/g, ''))
    }

    // Coinsurance applied
    const coinsuranceMatch = text.match(/coinsurance\s+applied\s*[:]\s*\$?([\d,]+\.?\d*)/gi)
    if (coinsuranceMatch) {
      amounts.coinsuranceApplied = parseFloat(coinsuranceMatch[0].split(/[:$]/)[1].replace(/,/g, ''))
    }

    // Copay applied
    const copayMatch = text.match(/copay\s+applied\s*[:]\s*\$?([\d,]+\.?\d*)/gi)
    if (copayMatch) {
      amounts.copayApplied = parseFloat(copayMatch[0].split(/[:$]/)[1].replace(/,/g, ''))
    }

    return amounts
  }

  private static extractNetworkInfo(text: string): ExtractedDocumentData['networkInfo'] {
    const networkInfo: ExtractedDocumentData['networkInfo'] = {}

    // Provider network status
    if (text.toLowerCase().includes('in-network') || text.toLowerCase().includes('participating')) {
      networkInfo.providerStatus = 'in-network'
    } else if (text.toLowerCase().includes('out-of-network') || text.toLowerCase().includes('non-participating')) {
      networkInfo.providerStatus = 'out-of-network'
    } else {
      networkInfo.providerStatus = 'unknown'
    }

    // Tier level
    const tierMatch = text.match(/tier\s+(\d+|one|two|three|four)/gi)
    if (tierMatch) {
      networkInfo.tierLevel = tierMatch[0].split(/\s+/)[1]
    }

    // Facility type
    const facilityPatterns = [
      /hospital/gi,
      /clinic/gi,
      /urgent\s+care/gi,
      /emergency/gi,
      /laboratory/gi,
      /imaging/gi
    ]

    for (const pattern of facilityPatterns) {
      if (pattern.test(text)) {
        networkInfo.facilityType = pattern.source.replace(/\\/g, '').replace(/gi$/, '')
        break
      }
    }

    return networkInfo
  }

  private static extractAppealInfo(text: string, documentType: ExtractedDocumentData['documentType']): ExtractedDocumentData['appealInfo'] | undefined {
    if (documentType !== 'Denial' && documentType !== 'Appeal') {
      return undefined
    }

    const appealInfo: ExtractedDocumentData['appealInfo'] = {}

    // Denial reasons
    const denialPatterns = [
      /(?:denied|not covered)\s+(?:because|reason)\s*[:]\s*([^\n\r.]+)/gi,
      /reason\s+for\s+denial\s*[:]\s*([^\n\r.]+)/gi,
      /not\s+medically\s+necessary/gi,
      /experimental\s+or\s+investigational/gi,
      /prior\s+authorization\s+required/gi
    ]

    const denialReasons: string[] = []
    denialPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        if (match[1]) {
          denialReasons.push(match[1].trim())
        } else {
          denialReasons.push(match[0].trim())
        }
      }
    })

    if (denialReasons.length > 0) {
      appealInfo.denialReason = denialReasons
    }

    // Appeal levels
    const appealLevelMatch = text.match(/(first|second|external)\s+level\s+appeal/gi)
    if (appealLevelMatch) {
      appealInfo.appealLevels = appealLevelMatch.map(match => match.trim())
    }

    // Deadlines
    const deadlineMatch = text.match(/appeal\s+(?:within|by)\s+(\d+)\s+days?/gi)
    if (deadlineMatch) {
      appealInfo.deadlines = deadlineMatch.map(match => match.trim())
    }

    // Contact info
    const contactMatch = text.match(/(?:appeal|contact)\s+(?:at|phone)\s*[:]\s*([^\n\r]+)/gi)
    if (contactMatch) {
      appealInfo.contactInfo = contactMatch[0].split(':')[1].trim()
    }

    return Object.keys(appealInfo).length > 0 ? appealInfo : undefined
  }

  static buildSessionContext(documents: ExtractedDocumentData[], sessionId: string): SessionContext {
    console.log(`🔗 Building session context from ${documents.length} documents`)

    const planContext = this.inferPlanContext(documents)
    const memberInfo = this.inferMemberInfo(documents)
    const extractedFacts = this.extractKeyFacts(documents)

    return {
      sessionId,
      documents,
      planContext,
      memberInfo,
      extractedFacts,
      lastUpdated: new Date()
    }
  }

  private static inferPlanContext(documents: ExtractedDocumentData[]): SessionContext['planContext'] {
    const planContext: SessionContext['planContext'] = {}

    // Infer plan type from documents
    documents.forEach(doc => {
      // Check for employer plan indicators
      if (doc.rawText.toLowerCase().includes('employer') ||
          doc.rawText.toLowerCase().includes('group plan') ||
          doc.planIdentifiers.groupNumber) {
        planContext.planType = 'Employer'
      }

      // Check for government plan indicators
      if (doc.rawText.toLowerCase().includes('medicaid')) {
        planContext.planType = 'Medicaid'
      } else if (doc.rawText.toLowerCase().includes('medicare')) {
        planContext.planType = 'Medicare'
      } else if (doc.rawText.toLowerCase().includes('cobra')) {
        planContext.planType = 'COBRA'
      }

      // Check for marketplace/individual plan indicators
      if (doc.rawText.toLowerCase().includes('marketplace') ||
          doc.rawText.toLowerCase().includes('individual plan')) {
        planContext.planType = 'Individual'
      }

      // Infer network type
      if (doc.rawText.toLowerCase().includes('hmo')) {
        planContext.networkType = 'HMO'
      } else if (doc.rawText.toLowerCase().includes('ppo')) {
        planContext.networkType = 'PPO'
      } else if (doc.rawText.toLowerCase().includes('epo')) {
        planContext.networkType = 'EPO'
      } else if (doc.rawText.toLowerCase().includes('pos')) {
        planContext.networkType = 'POS'
      }

      // Infer metal tier
      const metalTiers = ['bronze', 'silver', 'gold', 'platinum']
      for (const tier of metalTiers) {
        if (doc.rawText.toLowerCase().includes(tier)) {
          planContext.metalTier = (tier.charAt(0).toUpperCase() + tier.slice(1)) as any
          break
        }
      }
    })

    return planContext
  }

  private static inferMemberInfo(documents: ExtractedDocumentData[]): SessionContext['memberInfo'] {
    const memberInfo: SessionContext['memberInfo'] = {}

    documents.forEach(doc => {
      if (doc.planIdentifiers.memberId && !memberInfo.memberId) {
        memberInfo.memberId = doc.planIdentifiers.memberId
      }

      // Check for dependent indicators
      if (doc.rawText.toLowerCase().includes('dependent') ||
          doc.rawText.toLowerCase().includes('spouse') ||
          doc.rawText.toLowerCase().includes('child')) {
        memberInfo.primaryInsurance = false
      } else {
        memberInfo.primaryInsurance = true
      }
    })

    return memberInfo
  }

  private static extractKeyFacts(documents: ExtractedDocumentData[]): string[] {
    const facts: string[] = []

    documents.forEach(doc => {
      // Document type facts
      facts.push(`Document type: ${doc.documentType}`)

      // Amount facts
      if (doc.amounts.totalBilled) {
        facts.push(`Total billed: $${doc.amounts.totalBilled}`)
      }
      if (doc.amounts.patientResponsibility) {
        facts.push(`Patient responsibility: $${doc.amounts.patientResponsibility}`)
      }

      // Network facts
      if (doc.networkInfo.providerStatus) {
        facts.push(`Provider status: ${doc.networkInfo.providerStatus}`)
      }

      // Appeal facts
      if (doc.appealInfo?.denialReason) {
        facts.push(`Denial reasons: ${doc.appealInfo.denialReason.join(', ')}`)
      }

      // Service date facts
      if (doc.dates.serviceDate) {
        facts.push(`Service dates: ${doc.dates.serviceDate.join(', ')}`)
      }

      // Code facts
      if (doc.codes.cpt) {
        facts.push(`CPT codes: ${doc.codes.cpt.join(', ')}`)
      }
    })

    return facts
  }

  static mergeDocumentContext(existingContext: SessionContext, newDocuments: ExtractedDocumentData[]): SessionContext {
    console.log(`🔄 Merging ${newDocuments.length} new documents into existing context`)

    const allDocuments = [...existingContext.documents, ...newDocuments]
    const updatedPlanContext = this.inferPlanContext(allDocuments)
    const updatedMemberInfo = this.inferMemberInfo(allDocuments)
    const updatedFacts = this.extractKeyFacts(allDocuments)

    return {
      ...existingContext,
      documents: allDocuments,
      planContext: { ...existingContext.planContext, ...updatedPlanContext },
      memberInfo: { ...existingContext.memberInfo, ...updatedMemberInfo },
      extractedFacts: Array.from(new Set([...existingContext.extractedFacts, ...updatedFacts])),
      lastUpdated: new Date()
    }
  }

  static analyzeDocumentCompletion(context: SessionContext): {
    completenessScore: number
    missingElements: string[]
    recommendations: string[]
  } {
    const missingElements: string[] = []
    const recommendations: string[] = []

    // Check for essential document types
    const documentTypes = context.documents.map(d => d.documentType)

    if (!documentTypes.includes('EOB') && !documentTypes.includes('Bill')) {
      missingElements.push('Medical bill or EOB')
      recommendations.push('Upload your most recent medical bill or Explanation of Benefits')
    }

    if (!context.planContext?.planType) {
      missingElements.push('Insurance plan type')
      recommendations.push('Provide information about your insurance plan type (employer, marketplace, etc.)')
    }

    if (!context.memberInfo?.memberId) {
      missingElements.push('Member ID')
      recommendations.push('Include your insurance card or document with member ID')
    }

    // Check for appeal-specific completeness
    const hasdenial = documentTypes.includes('Denial')
    if (hasdenial && !documentTypes.includes('Appeal')) {
      recommendations.push('Consider uploading any appeal correspondence if you have filed an appeal')
    }

    // Calculate completeness score
    const totalPossibleElements = 10 // Arbitrary total for scoring
    const presentElements = totalPossibleElements - missingElements.length
    const completenessScore = presentElements / totalPossibleElements

    return {
      completenessScore,
      missingElements,
      recommendations
    }
  }
}