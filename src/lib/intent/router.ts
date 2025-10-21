/**
 * Intent Router for Unified Wyng Search Interface
 * Re-evaluates intent at each turn to enable Chat ⇄ Analyzer switching
 */

export type Intent = "CHAT" | "ANALYZER" | "CLARIFY"

export interface IntentInput {
  text?: string
  files?: FileMeta[]
  userClickedUpload?: boolean
  previousIntent?: Intent
}

export interface FileMeta {
  name: string
  size: number
  type: string
}

export interface IntentResult {
  intent: Intent
  confidence: number
  reason: string
  suggestedActions?: Array<{
    label: string
    value: Intent
    description: string
  }>
}

export class IntentRouter {
  // Keywords that strongly suggest bill/document analysis
  private readonly analyzerKeywords = [
    'bill', 'eob', 'charge', 'charged', 'overcharged', 'cpt', 'hcpcs', 'icd',
    'venipuncture', 'j7120', 'j7121', 'j7122', 'j7123', 'j7124', 'j7125',
    'itemized', 'explanation of benefits', 'billing statement', 'medical bill',
    'hospital bill', 'doctor bill', 'analyze', 'review', 'check', 'audit',
    'error', 'mistake', 'wrong', 'incorrect', 'dispute'
  ]

  // Keywords that suggest general insurance questions
  private readonly chatKeywords = [
    'ppo', 'hmo', 'epo', 'deductible', 'coinsurance', 'oop', 'out of pocket',
    'prior auth', 'prior authorization', 'referral', 'out-of-state', 'cobra',
    'marketplace', 'medicaid', 'medicare', 'formulary', 'tier', 'nsa',
    'external review', 'appeal', 'coverage', 'benefit', 'copay', 'premium',
    'network', 'in-network', 'out-of-network', 'provider', 'plan'
  ]

  public routeIntent(input: IntentInput): IntentResult {
    // 1) Files present = ANALYZER with high confidence
    if (input.files && input.files.length > 0) {
      return {
        intent: "ANALYZER",
        confidence: 0.95,
        reason: "Files detected - routing to bill analyzer"
      }
    }

    // 2) User explicitly clicked upload
    if (input.userClickedUpload) {
      return {
        intent: "ANALYZER",
        confidence: 0.9,
        reason: "User selected upload - expecting bill analysis"
      }
    }

    // 3) Text-based keyword analysis
    if (input.text) {
      const text = input.text.toLowerCase()
      const words = text.split(/\s+/)

      // Count keyword matches
      const analyzerMatches = this.analyzerKeywords.filter(keyword =>
        text.includes(keyword.toLowerCase())
      ).length

      const chatMatches = this.chatKeywords.filter(keyword =>
        text.includes(keyword.toLowerCase())
      ).length

      // Strong analyzer signals
      if (analyzerMatches >= 2 ||
          (analyzerMatches >= 1 && (text.includes('analyze') || text.includes('review') || text.includes('check')))) {
        return {
          intent: "ANALYZER",
          confidence: 0.85,
          reason: `Strong bill analysis keywords detected: ${analyzerMatches} matches`
        }
      }

      // Strong chat signals
      if (chatMatches >= 2 ||
          (chatMatches >= 1 && (text.includes('what') || text.includes('how') || text.includes('explain')))) {
        return {
          intent: "CHAT",
          confidence: 0.8,
          reason: `General insurance question detected: ${chatMatches} matches`
        }
      }

      // Single keyword matches with moderate confidence
      if (analyzerMatches === 1 && chatMatches === 0) {
        return {
          intent: "ANALYZER",
          confidence: 0.7,
          reason: "Single bill analysis keyword detected"
        }
      }

      if (chatMatches === 1 && analyzerMatches === 0) {
        return {
          intent: "CHAT",
          confidence: 0.7,
          reason: "Single insurance keyword detected"
        }
      }

      // Mixed signals or unclear - request clarification
      if (analyzerMatches > 0 && chatMatches > 0) {
        return {
          intent: "CLARIFY",
          confidence: 0.5,
          reason: "Mixed signals detected - needs clarification",
          suggestedActions: [
            {
              label: "Analyze my bill",
              value: "ANALYZER",
              description: "Upload and analyze medical bills or EOBs"
            },
            {
              label: "Ask a question",
              value: "CHAT",
              description: "Get answers about insurance coverage"
            }
          ]
        }
      }

      // Very short or unclear text
      if (words.length <= 3 || text.length <= 10) {
        return {
          intent: "CLARIFY",
          confidence: 0.3,
          reason: "Input too short - needs clarification",
          suggestedActions: [
            {
              label: "Analyze my bill",
              value: "ANALYZER",
              description: "Upload and analyze medical bills or EOBs"
            },
            {
              label: "Ask a question",
              value: "CHAT",
              description: "Get answers about insurance coverage"
            }
          ]
        }
      }

      // Default to chat for general text
      return {
        intent: "CHAT",
        confidence: 0.6,
        reason: "Default routing to general chat"
      }
    }

    // No input provided
    return {
      intent: "CLARIFY",
      confidence: 0,
      reason: "No input provided",
      suggestedActions: [
        {
          label: "Analyze my bill",
          value: "ANALYZER",
          description: "Upload and analyze medical bills or EOBs"
        },
        {
          label: "Ask a question",
          value: "CHAT",
          description: "Get answers about insurance coverage"
        }
      ]
    }
  }

  /**
   * Re-evaluate intent during an ongoing thread
   * Allows switching between Chat and Analyzer mid-conversation
   */
  public reevaluateIntent(input: IntentInput): IntentResult {
    // Files dropped mid-conversation always switch to analyzer
    if (input.files && input.files.length > 0) {
      return {
        intent: "ANALYZER",
        confidence: 0.95,
        reason: "Files dropped - switching to bill analyzer"
      }
    }

    // Otherwise use normal routing
    return this.routeIntent(input)
  }
}