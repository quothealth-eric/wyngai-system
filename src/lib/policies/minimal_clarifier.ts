/**
 * Minimal Clarifier Policy
 * Only ask follow-ups when critical slots are truly missing
 */

import { ContextFrame, SlotKey, SlotManager } from '../context/slots'

export interface ClarifierRule {
  name: string
  critical: SlotKey[]                 // if missing among these, we must clarify
  optional: SlotKey[]                 // if missing, proceed with assumptions + contingencies
  askIf: (frame: ContextFrame) => boolean
  message: (frame: ContextFrame) => string
}

export const CHANGE_COVERAGE_RULE: ClarifierRule = {
  name: 'change_coverage',
  critical: ['state', 'currentCoverage'],
  optional: ['qualifyingEvent', 'employerAffordability', 'household'],
  askIf: (frame) => {
    const hasState = SlotManager.getSlot(frame, 'state', 0.7)
    const hasCoverage = SlotManager.getSlot(frame, 'currentCoverage', 0.7)
    return !(hasState && hasCoverage)
  },
  message: (frame) => {
    const missingState = !SlotManager.getSlot(frame, 'state', 0.7)
    const missingCoverage = !SlotManager.getSlot(frame, 'currentCoverage', 0.7)

    if (missingState && missingCoverage) {
      return "To provide the best guidance on your coverage options, which state are you in and what type of coverage do you currently have (employer, marketplace, Medicaid, etc.)?"
    } else if (missingState) {
      return "Which state are you in? This helps me provide specific marketplace and regulatory information."
    } else {
      return "What type of health coverage do you currently have - employer plan, marketplace plan, Medicaid, or something else?"
    }
  }
}

export const BILL_ANALYSIS_RULE: ClarifierRule = {
  name: 'bill_analysis',
  critical: ['filesPresent'],
  optional: ['state', 'payer', 'planType'],
  askIf: (frame) => {
    const hasFiles = SlotManager.getSlot(frame, 'filesPresent', 0.7)
    return !hasFiles
  },
  message: () => "I'd be happy to analyze your medical bill for errors and savings opportunities. Please upload your itemized bill and explanation of benefits (EOB) if you have one."
}

export const APPEAL_HELP_RULE: ClarifierRule = {
  name: 'appeal_help',
  critical: ['state', 'payer'],
  optional: ['planType', 'filesPresent'],
  askIf: (frame) => {
    const hasState = SlotManager.getSlot(frame, 'state', 0.7)
    const hasPayer = SlotManager.getSlot(frame, 'payer', 0.7)
    return !(hasState && hasPayer)
  },
  message: (frame) => {
    const missingState = !SlotManager.getSlot(frame, 'state', 0.7)
    const missingPayer = !SlotManager.getSlot(frame, 'payer', 0.7)

    if (missingState && missingPayer) {
      return "To help with your appeal, which state are you in and who is your insurance company?"
    } else if (missingState) {
      return "Which state are you in? This affects your appeal rights and external review options."
    } else {
      return "Who is your insurance company? This helps me provide specific appeal procedures."
    }
  }
}

export class ClarifierPolicy {
  private static rules: ClarifierRule[] = [
    CHANGE_COVERAGE_RULE,
    BILL_ANALYSIS_RULE,
    APPEAL_HELP_RULE
  ]

  /**
   * Determine if clarification is needed based on intent and context
   */
  static needsClarification(
    frame: ContextFrame,
    intent: string,
    themes: string[]
  ): { needed: boolean; rule?: ClarifierRule; message?: string } {
    // Find applicable rule based on intent and themes
    const rule = this.findApplicableRule(intent, themes)

    if (!rule) {
      return { needed: false }
    }

    // Check if clarification is needed per the rule
    if (rule.askIf(frame)) {
      // Additional check: don't ask for slots that are already present with high confidence
      const alreadyAskedSlots = this.getAlreadyFilledSlots(frame, rule.critical)

      if (alreadyAskedSlots.length === rule.critical.length) {
        // All critical slots are filled, no clarification needed
        return { needed: false }
      }

      return {
        needed: true,
        rule,
        message: rule.message(frame)
      }
    }

    return { needed: false }
  }

  /**
   * Find the applicable clarifier rule for the given intent/themes
   */
  private static findApplicableRule(intent: string, themes: string[]): ClarifierRule | undefined {
    // Map intent and themes to rules
    if (intent === 'ANALYZER') {
      return BILL_ANALYSIS_RULE
    }

    const themeString = themes.join(' ').toLowerCase()

    if (themeString.includes('appeal') || themeString.includes('deny') || themeString.includes('claim')) {
      return APPEAL_HELP_RULE
    }

    if (
      themeString.includes('coverage') ||
      themeString.includes('plan') ||
      themeString.includes('marketplace') ||
      themeString.includes('enrollment')
    ) {
      return CHANGE_COVERAGE_RULE
    }

    // Default to change coverage rule for most chat intents
    return CHANGE_COVERAGE_RULE
  }

  /**
   * Get slots that are already filled with sufficient confidence
   */
  private static getAlreadyFilledSlots(frame: ContextFrame, slots: SlotKey[]): SlotKey[] {
    return slots.filter(key => SlotManager.getSlot(frame, key, 0.7))
  }

  /**
   * Check if we should suppress clarification due to redundancy
   */
  static shouldSuppressClarification(
    frame: ContextFrame,
    proposedClarification: string
  ): boolean {
    // Suppress if asking for information we already have with high confidence
    const highConfidenceSlots = Object.entries(frame.slots)
      .filter(([_, slot]) => slot && slot.confidence >= 0.7)
      .map(([key, _]) => key as SlotKey)

    // Check if the clarification is asking for slots we already have
    if (highConfidenceSlots.includes('state') && proposedClarification.toLowerCase().includes('state')) {
      return true
    }

    if (highConfidenceSlots.includes('currentCoverage') &&
        (proposedClarification.toLowerCase().includes('coverage') ||
         proposedClarification.toLowerCase().includes('insurance'))) {
      return true
    }

    return false
  }

  /**
   * Generate assumption-aware response when optional slots are missing
   */
  static generateAssumptionResponse(
    frame: ContextFrame,
    intent: string,
    themes: string[]
  ): {
    assumptions: string[]
    contingencies: string[]
  } {
    const assumptions: string[] = []
    const contingencies: string[] = []

    // Generate assumptions based on missing optional slots
    if (!SlotManager.getSlot(frame, 'qualifyingEvent', 0.7)) {
      assumptions.push("Assuming no recent qualifying life events")
      contingencies.push("If you've had a qualifying event (job loss, marriage, birth, move) in the last 60 days, you may be eligible for a Special Enrollment Period")
    }

    if (!SlotManager.getSlot(frame, 'employerAffordability', 0.7)) {
      assumptions.push("Need to verify employer plan affordability")
      contingencies.push("If your employer's family coverage costs more than 8.5% of household income, you may qualify for marketplace premium tax credits (2023+ family affordability fix)")
    }

    if (!SlotManager.getSlot(frame, 'household', 0.7)) {
      assumptions.push("Guidance applies to individual coverage")
      contingencies.push("If you have dependents, family coverage rules and costs will differ significantly")
    }

    return { assumptions, contingencies }
  }
}