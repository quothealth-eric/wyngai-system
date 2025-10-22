/**
 * Entity Extractor for Context Slots
 * Uses lightweight NER + regexes to extract entities from user input and files
 */

import { SlotKey, Slot, ContextFrame, SlotManager } from './slots'

export interface ExtractionInput {
  text?: string
  files?: Array<{ name: string; type: string; content?: string }>
  metadata?: any
}

export class EntityExtractor {

  /**
   * Extract all relevant slots from user input
   */
  static extractSlots(input: ExtractionInput): Array<{ key: SlotKey; value: any; confidence: number; source: Slot['source'] }> {
    const slots: Array<{ key: SlotKey; value: any; confidence: number; source: Slot['source'] }> = []

    if (input.text) {
      slots.push(...this.extractFromText(input.text))
    }

    if (input.files && input.files.length > 0) {
      slots.push(...this.extractFromFiles(input.files))
    }

    return slots
  }

  /**
   * Extract entities from text using patterns and keywords
   */
  private static extractFromText(text: string): Array<{ key: SlotKey; value: any; confidence: number; source: 'user' }> {
    const slots: Array<{ key: SlotKey; value: any; confidence: number; source: 'user' }> = []
    const lowerText = text.toLowerCase()

    // State extraction
    const state = this.extractState(text)
    if (state) {
      slots.push({ key: 'state', value: state, confidence: 0.9, source: 'user' })
    }

    // Current coverage type
    const coverage = this.extractCurrentCoverage(lowerText)
    if (coverage) {
      slots.push({ key: 'currentCoverage', value: coverage, confidence: 0.8, source: 'user' })
    }

    // Household composition
    const household = this.extractHousehold(lowerText)
    if (household) {
      slots.push({ key: 'household', value: household, confidence: 0.8, source: 'user' })
    }

    // Plan type
    const planType = this.extractPlanType(lowerText)
    if (planType) {
      slots.push({ key: 'planType', value: planType, confidence: 0.7, source: 'user' })
    }

    // Qualifying events
    const qualifyingEvent = this.extractQualifyingEvent(lowerText)
    if (qualifyingEvent) {
      slots.push({ key: 'qualifyingEvent', value: qualifyingEvent, confidence: 0.7, source: 'user' })
    }

    // Coverage needs/intent
    const needs = this.extractNeeds(lowerText)
    if (needs) {
      slots.push({ key: 'needs', value: needs, confidence: 0.8, source: 'user' })
    }

    // Insurance carrier/payer
    const payer = this.extractPayer(text)
    if (payer) {
      slots.push({ key: 'payer', value: payer, confidence: 0.7, source: 'user' })
    }

    return slots
  }

  /**
   * Extract state from text
   */
  private static extractState(text: string): string | null {
    const statePatterns = [
      // Full state names
      /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i,
      // State abbreviations
      /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/g,
      // Contextual patterns
      /(?:live in|from|in the state of|state of)\s+([a-z\s]+?)(?:\.|,|$|\s)/i
    ]

    for (const pattern of statePatterns) {
      const match = text.match(pattern)
      if (match) {
        let state = match[1] || match[0]
        const normalizedState = this.normalizeStateName(state.trim())
        if (normalizedState) return normalizedState
      }
    }

    return null
  }

  /**
   * Normalize state name to full name
   */
  private static normalizeStateName(input: string): string | null {
    const stateMap: Record<string, string> = {
      'fl': 'Florida',
      'florida': 'Florida',
      'ca': 'California',
      'california': 'California',
      'ny': 'New York',
      'new york': 'New York',
      'tx': 'Texas',
      'texas': 'Texas',
      // Add more as needed
    }

    const normalized = input.toLowerCase()
    return stateMap[normalized] || (input.length === 2 ? input.toUpperCase() :
           input.charAt(0).toUpperCase() + input.slice(1).toLowerCase())
  }

  /**
   * Extract current coverage type
   */
  private static extractCurrentCoverage(text: string): string | null {
    // Explicit "have/with" patterns take priority
    const explicitPatterns = [
      // Direct patterns: "have employer insurance"
      { pattern: /\b(have|with|on|under)\s+(employer|job|work|company)\s*(insurance|plan|coverage|health)\b/i, value: 'employer' },
      { pattern: /\b(have|with|on|under)\s+(marketplace|aca|obamacare|exchange)\s*(plan|insurance|coverage)\b/i, value: 'marketplace' },
      { pattern: /\b(have|with|on|under)\s+(medicaid|medicare)\b/i, value: (match: string) => match.includes('medicaid') ? 'medicaid' : 'medicare' },
      { pattern: /\b(have|with|on|under)\s+(cobra)\s*(coverage|plan)?\b/i, value: 'cobra' },

      // "Through" patterns: "have insurance through employer"
      { pattern: /\b(have|with|on|under)\s+.*\b(insurance|plan|coverage|health)\b.*\bthrough\s+(my\s+)?(employer|job|work|company)\b/i, value: 'employer' },
      { pattern: /\b(have|with|on|under)\s+.*\b(insurance|plan|coverage|health)\b.*\bthrough\s+(the\s+)?(marketplace|aca|obamacare|exchange)\b/i, value: 'marketplace' },
      { pattern: /\b(have|with|on|under)\s+.*\b(insurance|plan|coverage|health)\b.*\bthrough\s+(medicaid|medicare)\b/i, value: (match: string) => match.includes('medicaid') ? 'medicaid' : 'medicare' },

      { pattern: /\b(no|without|don't have|uninsured)\s*(insurance|coverage)\b/i, value: 'none' }
    ]

    // Check explicit patterns first
    for (const { pattern, value } of explicitPatterns) {
      const match = text.match(pattern)
      if (match) {
        return typeof value === 'function' ? value(match[0]) : value
      }
    }

    // Only check implicit patterns if no explicit patterns found
    // AND if text doesn't contain intent language like "switch to marketplace"
    if (!/\b(switch|change|move|want|need|can\s+i)\s+to\s+(marketplace|employer|medicaid|medicare|cobra)/i.test(text)) {
      const implicitPatterns = [
        { pattern: /\b(employer|job|work|company)\s*(insurance|plan|coverage|health)\b/i, value: 'employer' },
        { pattern: /\b(marketplace|aca|obamacare|exchange)\s*(plan|insurance|coverage)\b/i, value: 'marketplace' },
        { pattern: /\b(medicaid|medicare)\b/i, value: (match: string) => match.toLowerCase() },
        { pattern: /\b(cobra)\s*(coverage|plan)?\b/i, value: 'cobra' }
      ]

      for (const { pattern, value } of implicitPatterns) {
        const match = text.match(pattern)
        if (match) {
          return typeof value === 'function' ? value(match[0]) : value
        }
      }
    }

    return null
  }

  /**
   * Extract household composition
   */
  private static extractHousehold(text: string): string | null {
    const patterns = [
      /\b(married|spouse|husband|wife)\b.*\b(child|children|kid|baby|son|daughter)\b/i,
      /\b(child|children|kid|baby|son|daughter)\b.*\b(married|spouse|husband|wife)\b/i,
      /\bfamily\s+of\s+(\d+)\b/i,
      /\b(spouse|husband|wife)\s+(just\s+)?(lost|losing|lose)\s+coverage\b/i, // "spouse lost coverage"
      /\b(married|spouse|husband|wife)\b/i,
      /\b(child|children|kid|baby|son|daughter)\b/i,
      /\bnewborn|new\s+baby|having\s+a\s+baby\b/i
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const matchText = match[0].toLowerCase()

        // Check for spouse + child combinations
        if ((matchText.includes('married') || matchText.includes('spouse') || matchText.includes('wife') || matchText.includes('husband')) &&
            (matchText.includes('child') || matchText.includes('baby') || matchText.includes('newborn'))) {
          return 'spouse+child'
        }

        // Check for spouse-specific patterns
        if (matchText.includes('spouse') || matchText.includes('husband') || matchText.includes('wife') || matchText.includes('married')) {
          return 'spouse'
        }

        // Check for child-specific patterns
        if (matchText.includes('child') || matchText.includes('baby') || matchText.includes('newborn')) {
          return 'child'
        }

        // Handle family size
        if (match[1]) { // family of N
          const size = parseInt(match[1])
          if (size === 2) return 'spouse'
          if (size >= 3) return 'spouse+child'
        }
      }
    }

    return null
  }

  /**
   * Extract plan type
   */
  private static extractPlanType(text: string): string | null {
    const patterns = [
      { pattern: /\bhmo\b/i, value: 'HMO' },
      { pattern: /\bppo\b/i, value: 'PPO' },
      { pattern: /\bepo\b/i, value: 'EPO' },
      { pattern: /\bhdhp\b|high.deductible/i, value: 'HDHP' },
      { pattern: /\bpos\b/i, value: 'POS' }
    ]

    for (const { pattern, value } of patterns) {
      if (pattern.test(text)) {
        return value
      }
    }

    return null
  }

  /**
   * Extract qualifying events
   */
  private static extractQualifyingEvent(text: string): string | null {
    const patterns = [
      { pattern: /\b(lost|losing|lose)\s+(coverage|insurance|job)\b/i, value: 'losing coverage' },
      { pattern: /\b(new\s+baby|newborn|birth|pregnant|having\s+a\s+baby)\b/i, value: 'birth' },
      { pattern: /\b(married|getting\s+married|wedding)\b/i, value: 'marriage' },
      { pattern: /\b(moved|moving|relocat|new\s+address)\b/i, value: 'move' },
      { pattern: /\b(divorced|separation)\b/i, value: 'divorce' }
    ]

    for (const { pattern, value } of patterns) {
      if (pattern.test(text)) {
        return value
      }
    }

    return null
  }

  /**
   * Extract user needs/intent
   */
  private static extractNeeds(text: string): string | null {
    const patterns = [
      { pattern: /\b(switch|change|different)\s+(to\s+)?(plan|coverage|insurance|marketplace)\b/i, value: 'switch plan' },
      { pattern: /\b(switch\s+to\s+marketplace|change\s+to\s+marketplace)\b/i, value: 'switch plan' },
      { pattern: /\b(add|include)\s+(spouse|child|dependent|family)\b/i, value: 'add dependent' },
      { pattern: /\b(cost|price|afford|expensive|cheap)\b/i, value: 'cost estimate' },
      { pattern: /\b(appeal|deny|denied|claim|dispute)\b/i, value: 'appeal' },
      { pattern: /\b(marketplace)\s+(or|vs)\b/i, value: 'switch plan' }, // "marketplace or employer"
      { pattern: /\b(compare|options)\b/i, value: 'compare options' }
    ]

    for (const { pattern, value } of patterns) {
      if (pattern.test(text)) {
        return value
      }
    }

    return null
  }

  /**
   * Extract insurance carrier/payer names
   */
  private static extractPayer(text: string): string | null {
    const payerPatterns = [
      { pattern: /\baetna\b/i, value: 'Aetna' },
      { pattern: /\banthem\b/i, value: 'Anthem' },
      { pattern: /\bbcbs\b|blue cross blue shield/i, value: 'BCBS' },
      { pattern: /\bblue cross\b/i, value: 'Blue Cross' },
      { pattern: /\bblue shield\b/i, value: 'Blue Shield' },
      { pattern: /\bcigna\b/i, value: 'Cigna' },
      { pattern: /\bhumana\b/i, value: 'Humana' },
      { pattern: /\bkaiser\b/i, value: 'Kaiser' },
      { pattern: /\bmolina\b/i, value: 'Molina' },
      { pattern: /\bunitedhealthcare\b|united healthcare|\buhc\b/i, value: 'UnitedHealthcare' }
    ]

    for (const { pattern, value } of payerPatterns) {
      if (pattern.test(text)) {
        return value
      }
    }

    return null
  }

  /**
   * Extract information from uploaded files
   */
  private static extractFromFiles(files: Array<{ name: string; type: string; content?: string }>): Array<{ key: SlotKey; value: any; confidence: number; source: 'ocr' }> {
    const slots: Array<{ key: SlotKey; value: any; confidence: number; source: 'ocr' }> = []

    // Mark that files are present
    if (files.length > 0) {
      const fileTypes = files.map(f => {
        if (f.name.toLowerCase().includes('eob') || f.type.includes('explanation')) return 'eob'
        if (f.name.toLowerCase().includes('bill') || f.name.toLowerCase().includes('invoice')) return 'bill'
        if (f.name.toLowerCase().includes('card') || f.name.toLowerCase().includes('insurance')) return 'insurance_card'
        return 'document'
      }).join(',')

      slots.push({ key: 'filesPresent', value: fileTypes, confidence: 1.0, source: 'ocr' })
    }

    // Extract from file content if available
    for (const file of files) {
      if (file.content) {
        const textSlots = this.extractFromText(file.content).map(slot => ({
          ...slot,
          source: 'ocr' as const
        }))
        slots.push(...textSlots)
      }
    }

    return slots
  }

  /**
   * Update context frame with new input
   */
  static updateContextFrame(frame: ContextFrame, input: ExtractionInput): ContextFrame {
    const extractedSlots = this.extractSlots(input)
    return SlotManager.mergeSlots(frame, extractedSlots)
  }
}