/**
 * Context Frame & Slot Manager
 * Extracts and manages facts from user conversations to prevent redundant clarifiers
 */

export type SlotKey =
  | "state"
  | "currentCoverage"          // employer | marketplace | medicaid | medicare | cobra | none
  | "household"                // spouse/children present
  | "planType"                 // HMO|PPO|EPO|HDHP|Other
  | "employerAffordability"    // affordable|unaffordable|unknown  (post-2023 family affordability)
  | "qualifyingEvent"          // losing coverage|birth|marriage|move|none|unknown
  | "coverageChangeTiming"     // openEnrollment|midYear
  | "needs"                    // "switch plan" | "add dependent" | "cost estimate" | "appeal"
  | "payer"                    // if user names carrier
  | "marketplaceType"          // healthcare.gov | state-based
  | "householdIncomeBand"      // optional, unknown ok
  | "dobDOS"                   // date context if relevant
  | "filesPresent"             // bill/eob/insurance_card

export interface Slot {
  key: SlotKey
  value: any
  confidence: number     // 0..1 from NER/classifier
  source: "user" | "ocr" | "assumption" | "inferred"
  lastUpdated: number
}

export interface ContextFrame {
  threadId: string
  slots: Record<SlotKey, Slot | undefined>
}

export class SlotManager {
  /**
   * Create a new context frame for a thread
   */
  static createFrame(threadId: string): ContextFrame {
    return {
      threadId,
      slots: {}
    }
  }

  /**
   * Update a slot with new information
   */
  static updateSlot(
    frame: ContextFrame,
    key: SlotKey,
    value: any,
    confidence: number,
    source: Slot['source']
  ): ContextFrame {
    const now = Date.now()
    const existing = frame.slots[key]

    // If existing slot has high confidence and new value is similar, keep existing
    if (existing && existing.confidence >= 0.7 && this.isSimilarValue(existing.value, value)) {
      return frame
    }

    // If both have high confidence but contradict, we'll need clarification
    if (existing && existing.confidence >= 0.7 && confidence >= 0.7 && !this.isSimilarValue(existing.value, value)) {
      // Mark for clarification by reducing confidence but keep the new value
      return {
        ...frame,
        slots: {
          ...frame.slots,
          [key]: {
            key,
            value,
            confidence: 0.5, // Reduced confidence due to conflict
            source,
            lastUpdated: now
          }
        }
      }
    }

    return {
      ...frame,
      slots: {
        ...frame.slots,
        [key]: {
          key,
          value,
          confidence,
          source,
          lastUpdated: now
        }
      }
    }
  }

  /**
   * Get a slot value with minimum confidence threshold
   */
  static getSlot(frame: ContextFrame, key: SlotKey, minConfidence = 0.6): Slot | undefined {
    const slot = frame.slots[key]
    return slot && slot.confidence >= minConfidence ? slot : undefined
  }

  /**
   * Check if the frame has all critical slots filled
   */
  static hasCriticalSlots(frame: ContextFrame, criticalSlots: SlotKey[]): boolean {
    return criticalSlots.every(key => this.getSlot(frame, key, 0.7))
  }

  /**
   * Get missing critical slots
   */
  static getMissingCriticalSlots(frame: ContextFrame, criticalSlots: SlotKey[]): SlotKey[] {
    return criticalSlots.filter(key => !this.getSlot(frame, key, 0.7))
  }

  /**
   * Check if two values are similar (to avoid re-asking)
   */
  private static isSimilarValue(value1: any, value2: any): boolean {
    if (typeof value1 === 'string' && typeof value2 === 'string') {
      return value1.toLowerCase().trim() === value2.toLowerCase().trim()
    }
    return value1 === value2
  }

  /**
   * Merge slots from multiple sources (user input + OCR + previous context)
   */
  static mergeSlots(
    frame: ContextFrame,
    newSlots: Array<{ key: SlotKey; value: any; confidence: number; source: Slot['source'] }>
  ): ContextFrame {
    let updatedFrame = frame

    for (const slot of newSlots) {
      updatedFrame = this.updateSlot(
        updatedFrame,
        slot.key,
        slot.value,
        slot.confidence,
        slot.source
      )
    }

    return updatedFrame
  }

  /**
   * Generate confidence summary for display
   */
  static getConfidenceSummary(frame: ContextFrame): string {
    const highConfidenceSlots = Object.values(frame.slots).filter(
      slot => slot && slot.confidence >= 0.8
    )

    const contextItems = highConfidenceSlots.map(slot => {
      if (slot.key === 'state') return slot.value
      if (slot.key === 'currentCoverage') return slot.value === 'employer' ? 'Employer Plan' : slot.value
      if (slot.key === 'household') return slot.value
      return null
    }).filter(Boolean)

    return contextItems.length > 0 ? contextItems.join(' • ') : ''
  }

  /**
   * Convert frame to JSON for storage
   */
  static serialize(frame: ContextFrame): string {
    return JSON.stringify(frame)
  }

  /**
   * Restore frame from JSON
   */
  static deserialize(json: string): ContextFrame {
    try {
      const parsed = JSON.parse(json)
      return parsed as ContextFrame
    } catch (error) {
      throw new Error(`Failed to deserialize context frame: ${error}`)
    }
  }
}