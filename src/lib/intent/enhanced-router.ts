/**
 * Enhanced Intent Router with Confidence Scoring and Theme Detection
 * Classifies user input into Chat/Analyzer modes with detailed context
 */

import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client only when environment variables are available
const supabase = typeof window === 'undefined' && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE)
  : null

// Core intent types
export type Intent = "CHAT" | "ANALYZER" | "CLARIFY"

// Theme categories for detailed classification
export type Theme =
  | "Open Enrollment" | "Special Enrollment Period"
  | "Plan Type" | "Prior Authorization" | "Referral"
  | "Out-of-State Coverage" | "COBRA" | "Medicaid" | "Medicare"
  | "Formulary/Tiers" | "Exception/Appeal"
  | "NSA Emergency" | "NSA Ancillary" | "External Review"
  | "Price Transparency" | "EOB Math" | "Bill Audit"
  | "Provider Network" | "Continuity of Care" | "Balance Billing"
  | "Coverage Transfer (Moving States)" | "State Marketplace"
  | "Other"

// Input for intent classification
export interface IntentInput {
  text?: string
  files?: Array<{ name: string; size: number; type: string }>
  context?: {
    previousIntent?: Intent
    planType?: string
    state?: string
    conversationHistory?: string[]
  }
}

// Detailed classification result
export interface IntentResult {
  intent: Intent
  confidence: number              // 0.0 to 1.0
  themes: Array<{ theme: Theme; score: number }>
  state?: string                  // inferred state from text
  marketplace?: "Healthcare.gov" | "State-based"
  payer?: string                  // detected payer if available
  reasons: string[]               // features that led to classification
  suggestedActions?: Array<{
    label: string
    value: Intent
    description: string
  }>
  processingTimeMs?: number
}

export class EnhancedIntentRouter {
  private stateNames: Set<string>
  private stateAbbreviations: Set<string>
  private payerNames: Set<string>
  private stateBased: Set<string>

  constructor() {
    // Initialize state recognition data
    this.stateNames = new Set([
      'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
      'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
      'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
      'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
      'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
      'new hampshire', 'new jersey', 'new mexico', 'new york',
      'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
      'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
      'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
      'west virginia', 'wisconsin', 'wyoming', 'district of columbia'
    ])

    this.stateAbbreviations = new Set([
      'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id',
      'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms',
      'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok',
      'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv',
      'wi', 'wy', 'dc'
    ])

    this.payerNames = new Set([
      'unitedhealthcare', 'uhc', 'aetna', 'cigna', 'anthem', 'elevance',
      'humana', 'kaiser', 'blue cross', 'blue shield', 'bcbs', 'wellcare',
      'molina', 'centene', 'medicaid', 'medicare', 'tricare'
    ])

    // State-based marketplaces (not using Healthcare.gov)
    this.stateBased = new Set([
      'ca', 'co', 'ct', 'dc', 'id', 'ma', 'md', 'mn', 'nv', 'ny', 'pa',
      'ri', 'vt', 'wa', 'california', 'colorado', 'connecticut',
      'district of columbia', 'idaho', 'massachusetts', 'maryland',
      'minnesota', 'nevada', 'new york', 'pennsylvania', 'rhode island',
      'vermont', 'washington'
    ])
  }

  /**
   * Main intent routing function
   */
  async routeIntent(input: IntentInput): Promise<IntentResult> {
    const startTime = Date.now()
    const text = input.text?.toLowerCase() || ''
    const files = input.files || []
    const reasons: string[] = []

    // High confidence for file uploads
    if (files.length > 0) {
      reasons.push(`${files.length} file(s) uploaded`)
      const themes = this.detectBillThemes(text)
      const state = this.extractState(text)

      return {
        intent: 'ANALYZER',
        confidence: 0.95,
        themes,
        state,
        reasons,
        processingTimeMs: Date.now() - startTime
      }
    }

    // Empty text
    if (!text.trim()) {
      return {
        intent: 'CLARIFY',
        confidence: 0.5,
        themes: [{ theme: 'Other', score: 1.0 }],
        reasons: ['No input provided'],
        suggestedActions: [
          { label: 'Ask a question', value: 'CHAT', description: 'Get answers about insurance coverage and benefits' },
          { label: 'Analyze my bill', value: 'ANALYZER', description: 'Upload and analyze medical bills for errors and savings' }
        ],
        processingTimeMs: Date.now() - startTime
      }
    }

    // Analyze text for intent signals
    const analyzerSignals = this.getAnalyzerSignals(text)
    const chatSignals = this.getChatSignals(text)
    const themes = this.detectThemes(text)
    const state = this.extractState(text)
    const payer = this.extractPayer(text)
    const marketplace = this.determineMarketplace(state)

    // Calculate confidence scores
    const analyzerScore = this.calculateAnalyzerConfidence(analyzerSignals, text)
    const chatScore = this.calculateChatConfidence(chatSignals, text)

    let intent: Intent
    let confidence: number

    if (analyzerScore > chatScore && analyzerScore > 0.7) {
      intent = 'ANALYZER'
      confidence = analyzerScore
      reasons.push(...analyzerSignals.map(s => `Analyzer signal: ${s}`))
    } else if (chatScore > 0.6) {
      intent = 'CHAT'
      confidence = chatScore
      reasons.push(...chatSignals.map(s => `Chat signal: ${s}`))
    } else {
      intent = 'CLARIFY'
      confidence = Math.max(analyzerScore, chatScore)
      reasons.push('Ambiguous input requiring clarification')
    }

    // Handle ambiguous cases
    if (intent === 'CLARIFY' || confidence < 0.6) {
      const suggestedActions: IntentResult['suggestedActions'] = []

      if (analyzerScore > 0.3) {
        suggestedActions.push({
          label: 'Analyze my bill',
          value: 'ANALYZER',
          description: 'Upload and analyze medical bills for errors and savings'
        })
      }

      if (chatSignals.length > 0 || themes.length > 0) {
        suggestedActions.push({
          label: 'Ask a question',
          value: 'CHAT',
          description: 'Get answers about insurance coverage and benefits'
        })
      }

      return {
        intent: 'CLARIFY',
        confidence,
        themes,
        state,
        payer,
        marketplace,
        reasons,
        suggestedActions,
        processingTimeMs: Date.now() - startTime
      }
    }

    const result: IntentResult = {
      intent,
      confidence,
      themes,
      state,
      payer,
      marketplace,
      reasons,
      processingTimeMs: Date.now() - startTime
    }

    // Store classification for analytics
    await this.storeClassification(input, result)

    return result
  }

  private getAnalyzerSignals(text: string): string[] {
    const signals: string[] = []

    // Bill/document analysis keywords
    const billKeywords = [
      'bill', 'billed', 'billing', 'charge', 'charged', 'cost', 'costs',
      'eob', 'explanation of benefits', 'statement', 'invoice', 'receipt',
      'overcharged', 'error', 'wrong', 'mistake', 'dispute', 'appeal',
      'denied', 'rejection', 'claim', 'payment', 'copay', 'deductible',
      'coinsurance', 'out of pocket', 'balance', 'owe', 'owing'
    ]

    for (const keyword of billKeywords) {
      if (text.includes(keyword)) {
        signals.push(keyword)
      }
    }

    // CPT/procedure codes
    if (/\b\d{5}\b/.test(text)) {
      signals.push('procedure_codes_detected')
    }

    // Dollar amounts
    if (/\$\d+/.test(text)) {
      signals.push('dollar_amounts_detected')
    }

    // Analysis-specific phrases
    const analysisPhrases = [
      'analyze', 'review', 'check', 'audit', 'examine', 'look at',
      'is this correct', 'should i pay', 'do i owe', 'was i overcharged'
    ]

    for (const phrase of analysisPhrases) {
      if (text.includes(phrase)) {
        signals.push(`phrase: ${phrase}`)
      }
    }

    return signals
  }

  private getChatSignals(text: string): string[] {
    const signals: string[] = []

    // Question words
    const questionWords = ['what', 'how', 'when', 'where', 'why', 'which', 'who']
    for (const word of questionWords) {
      if (text.startsWith(word) || text.includes(` ${word} `)) {
        signals.push(`question_word: ${word}`)
      }
    }

    // Question punctuation
    if (text.includes('?')) {
      signals.push('question_mark')
    }

    // Insurance terminology
    const insuranceTerms = [
      'coverage', 'covered', 'benefits', 'plan', 'policy', 'premium',
      'network', 'provider', 'referral', 'authorization', 'formulary',
      'enrollment', 'eligible', 'qualify'
    ]

    for (const term of insuranceTerms) {
      if (text.includes(term)) {
        signals.push(`insurance_term: ${term}`)
      }
    }

    return signals
  }

  private detectThemes(text: string): Array<{ theme: Theme; score: number }> {
    const themes: Array<{ theme: Theme; score: number }> = []

    const themeKeywords: Record<Theme, string[]> = {
      "Open Enrollment": ["open enrollment", "enroll", "sign up", "marketplace"],
      "Special Enrollment Period": ["sep", "special enrollment", "qualifying event", "lost coverage"],
      "Plan Type": ["hmo", "ppo", "epo", "hdhp", "pos", "plan type"],
      "Prior Authorization": ["prior auth", "preauthorization", "approval", "precert"],
      "Referral": ["referral", "refer", "specialist"],
      "Out-of-State Coverage": ["out of state", "travel", "moving", "different state"],
      "COBRA": ["cobra", "continuation coverage"],
      "Medicaid": ["medicaid", "medi-cal", "masshealth"],
      "Medicare": ["medicare", "part a", "part b", "part c", "part d"],
      "Formulary/Tiers": ["formulary", "tier", "drug coverage", "prescription"],
      "Exception/Appeal": ["appeal", "exception", "grievance", "dispute"],
      "NSA Emergency": ["emergency", "er", "ambulance", "surprise billing"],
      "NSA Ancillary": ["anesthesia", "radiology", "pathology", "ancillary"],
      "External Review": ["external review", "independent review"],
      "Price Transparency": ["price", "cost", "estimate", "transparency"],
      "EOB Math": ["eob", "explanation", "calculation", "math"],
      "Bill Audit": ["audit", "review", "error", "overcharge"],
      "Provider Network": ["network", "in network", "out of network"],
      "Continuity of Care": ["continuity", "transition", "care coordination"],
      "Balance Billing": ["balance bill", "extra charges", "provider charges"],
      "Coverage Transfer (Moving States)": ["moving", "relocating", "new state"],
      "State Marketplace": ["state exchange", "marketplace", "enrollment"],
      "Other": []
    }

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      let score = 0
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          score += 1 / keywords.length
        }
      }
      if (score > 0) {
        themes.push({ theme: theme as Theme, score: Math.min(score, 1.0) })
      }
    }

    // If no themes detected, add "Other"
    if (themes.length === 0) {
      themes.push({ theme: "Other", score: 0.5 })
    }

    return themes.sort((a, b) => b.score - a.score)
  }

  private detectBillThemes(text: string): Array<{ theme: Theme; score: number }> {
    // Analyzer-specific theme detection
    const themes = this.detectThemes(text)

    // Add bill-specific themes if not present
    const billThemes: Theme[] = ["EOB Math", "Bill Audit", "Price Transparency"]
    for (const billTheme of billThemes) {
      if (!themes.find(t => t.theme === billTheme)) {
        themes.push({ theme: billTheme, score: 0.8 })
      }
    }

    return themes
  }

  private extractState(text: string): string | undefined {
    const words = text.toLowerCase().split(/\s+/)

    // Check for state abbreviations
    for (const word of words) {
      if (this.stateAbbreviations.has(word)) {
        return word.toUpperCase()
      }
    }

    // Check for state names
    for (const stateName of this.stateNames) {
      if (text.includes(stateName)) {
        // Convert to abbreviation
        const stateMap: Record<string, string> = {
          'california': 'CA', 'new york': 'NY', 'texas': 'TX', 'florida': 'FL',
          'illinois': 'IL', 'pennsylvania': 'PA', 'ohio': 'OH', 'georgia': 'GA',
          'north carolina': 'NC', 'michigan': 'MI', 'new jersey': 'NJ',
          'virginia': 'VA', 'washington': 'WA', 'arizona': 'AZ',
          'massachusetts': 'MA', 'tennessee': 'TN', 'indiana': 'IN',
          'missouri': 'MO', 'maryland': 'MD', 'wisconsin': 'WI',
          'colorado': 'CO', 'minnesota': 'MN', 'south carolina': 'SC',
          'alabama': 'AL', 'louisiana': 'LA', 'kentucky': 'KY',
          'oregon': 'OR', 'oklahoma': 'OK', 'connecticut': 'CT',
          'utah': 'UT', 'iowa': 'IA', 'nevada': 'NV', 'arkansas': 'AR',
          'mississippi': 'MS', 'kansas': 'KS', 'new mexico': 'NM',
          'nebraska': 'NE', 'west virginia': 'WV', 'idaho': 'ID',
          'hawaii': 'HI', 'new hampshire': 'NH', 'maine': 'ME',
          'montana': 'MT', 'rhode island': 'RI', 'delaware': 'DE',
          'south dakota': 'SD', 'north dakota': 'ND', 'alaska': 'AK',
          'vermont': 'VT', 'wyoming': 'WY', 'district of columbia': 'DC'
        }
        return stateMap[stateName]
      }
    }

    return undefined
  }

  private extractPayer(text: string): string | undefined {
    const words = text.toLowerCase().split(/\s+/)

    for (const word of words) {
      if (this.payerNames.has(word)) {
        // Standardize payer names
        const payerMap: Record<string, string> = {
          'uhc': 'UnitedHealthcare',
          'unitedhealthcare': 'UnitedHealthcare',
          'aetna': 'Aetna',
          'cigna': 'Cigna',
          'anthem': 'Anthem',
          'elevance': 'Elevance Health',
          'humana': 'Humana',
          'kaiser': 'Kaiser Permanente',
          'medicaid': 'Medicaid',
          'medicare': 'Medicare',
          'tricare': 'TRICARE'
        }
        return payerMap[word] || word
      }
    }

    // Check for multi-word payers
    if (text.includes('blue cross') || text.includes('blue shield')) {
      return 'Blue Cross Blue Shield'
    }

    return undefined
  }

  private determineMarketplace(state?: string): "Healthcare.gov" | "State-based" | undefined {
    if (!state) return undefined

    return this.stateBased.has(state.toLowerCase()) ? "State-based" : "Healthcare.gov"
  }

  private calculateAnalyzerConfidence(signals: string[], text: string): number {
    let confidence = 0

    // Base confidence from signals
    confidence += Math.min(signals.length * 0.2, 0.8)

    // Boost for strong analyzer indicators
    if (signals.some(s => s.includes('bill') || s.includes('eob'))) {
      confidence += 0.3
    }

    if (signals.some(s => s.includes('dollar_amounts'))) {
      confidence += 0.2
    }

    if (signals.some(s => s.includes('analyze') || s.includes('review'))) {
      confidence += 0.3
    }

    return Math.min(confidence, 1.0)
  }

  private calculateChatConfidence(signals: string[], text: string): number {
    let confidence = 0

    // Base confidence from signals
    confidence += Math.min(signals.length * 0.15, 0.7)

    // Boost for questions
    if (signals.some(s => s.includes('question'))) {
      confidence += 0.3
    }

    // Boost for insurance terminology
    if (signals.filter(s => s.includes('insurance_term')).length > 1) {
      confidence += 0.3
    }

    return Math.min(confidence, 1.0)
  }

  private async storeClassification(input: IntentInput, result: IntentResult): Promise<void> {
    try {
      // Only store classification if Supabase is available (server-side)
      if (supabase) {
        await supabase.from('intent_classifications').insert({
          intent: result.intent,
          confidence: result.confidence,
          themes: result.themes,
          state: result.state,
          marketplace: result.marketplace,
          payer: result.payer,
          reasons: result.reasons,
          processing_time_ms: result.processingTimeMs
        })
      }
    } catch (error) {
      console.error('Failed to store intent classification:', error)
      // Don't throw - this is analytics only
    }
  }
}