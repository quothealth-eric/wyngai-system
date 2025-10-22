/**
 * Enhanced Answer Composer
 * Produces complete, structured responses with links, scripts, and citations
 */

import { ContextFrame, SlotManager } from '../context/slots'
import { LinkResolver, ResourceLink } from '../links/resolve'
import { ClarifierPolicy } from '../policies/minimal_clarifier'

export interface ComposerInput {
  frame: ContextFrame
  intent: string
  themes: string[]
  retrievedChunks: any[]
  linkHints?: string[]
  userQuery: string
}

export interface StructuredResponse {
  summary: string
  options: string[]
  eligibilityTiming: string
  whereToGo: ResourceLink[]
  nextSteps: string[]
  scripts: Script[]
  citations: Citation[]
  confidencePill: string
  analyzerNote?: string
}

export interface Script {
  channel: 'payer' | 'provider' | 'hr' | 'marketplace'
  purpose: string
  body: string
  estimatedDuration: string
}

export interface Citation {
  authority: string
  title: string
  url?: string
  tier: 'federal' | 'cms' | 'state_doi' | 'marketplace' | 'payer'
}

export class AnswerComposer {
  /**
   * Compose a complete structured answer based on context and intent
   */
  static async composeAnswer(input: ComposerInput): Promise<StructuredResponse> {
    const { frame, intent, themes, userQuery } = input

    // Get context from slots
    const state = SlotManager.getSlot(frame, 'state', 0.7)?.value
    const currentCoverage = SlotManager.getSlot(frame, 'currentCoverage', 0.7)?.value
    const household = SlotManager.getSlot(frame, 'household', 0.7)?.value
    const needs = SlotManager.getSlot(frame, 'needs', 0.7)?.value
    const payer = SlotManager.getSlot(frame, 'payer', 0.7)?.value
    const filesPresent = SlotManager.getSlot(frame, 'filesPresent', 0.7)?.value

    // Generate contextual links
    const links = LinkResolver.getContextualLinks({
      state,
      payer,
      intent,
      needs
    })

    // Handle analyzer intent with files
    if (intent === 'ANALYZER' || filesPresent) {
      return this.composeAnalyzerResponse(input, links)
    }

    // Handle coverage change scenario (the gold standard example)
    if (this.isCoverageChangeScenario(themes, needs)) {
      return this.composeCoverageChangeResponse(input, links)
    }

    // Handle appeal scenarios
    if (this.isAppealScenario(themes, needs)) {
      return this.composeAppealResponse(input, links)
    }

    // Default structured response
    return this.composeGeneralResponse(input, links)
  }

  /**
   * Detect if this is a coverage change scenario (our gold standard)
   */
  private static isCoverageChangeScenario(themes: string[], needs?: string): boolean {
    const themeString = themes.join(' ').toLowerCase()
    return (
      themeString.includes('coverage') ||
      themeString.includes('marketplace') ||
      themeString.includes('enrollment') ||
      needs?.includes('switch') ||
      needs?.includes('compare')
    )
  }

  /**
   * Detect if this is an appeal scenario
   */
  private static isAppealScenario(themes: string[], needs?: string): boolean {
    const themeString = themes.join(' ').toLowerCase()
    return (
      themeString.includes('appeal') ||
      themeString.includes('deny') ||
      themeString.includes('external review') ||
      needs?.includes('appeal')
    )
  }

  /**
   * Compose the gold standard coverage change response
   */
  private static composeCoverageChangeResponse(
    input: ComposerInput,
    links: ResourceLink[]
  ): StructuredResponse {
    const { frame } = input
    const state = SlotManager.getSlot(frame, 'state', 0.7)?.value || 'your state'
    const currentCoverage = SlotManager.getSlot(frame, 'currentCoverage', 0.7)?.value || 'current plan'
    const household = SlotManager.getSlot(frame, 'household', 0.7)?.value
    const payer = SlotManager.getSlot(frame, 'payer', 0.7)?.value

    // Generate assumptions and contingencies for missing optional slots
    const { assumptions, contingencies } = ClarifierPolicy.generateAssumptionResponse(
      frame,
      input.intent,
      input.themes
    )

    const marketplaceType = state !== 'your state' ? LinkResolver.getMarketplaceType(state) : 'Healthcare.gov'
    const isFFE = state !== 'your state' ? LinkResolver.isFFEState(state) : true

    const summary = `You're on ${currentCoverage} coverage${state !== 'your state' ? ` in ${state}` : ''} and want to switch. You can use the Marketplace either during Open Enrollment or if you qualify for a Special Enrollment Period (SEP); otherwise you can change plans at your employer's Open Enrollment.`

    const options = [
      `**Stay employer plan** until your employer's Open Enrollment; compare total annual cost (premium + deductible + coinsurance + OOP max).`,
      `**Marketplace (${marketplaceType})** if you have a SEP (e.g., loss of employer coverage, move, birth/adoption) or during Open Enrollment (Nov 1–Jan 15).`,
      household === 'spouse+child' || household === 'spouse'
        ? `**Family affordability (2023 fix)**: your ${household === 'spouse+child' ? 'spouse/child' : 'spouse'} may qualify for Marketplace savings even if your employee-only plan is affordable, if family coverage is unaffordable under IRS rules.`
        : `**Individual vs family coverage**: if you have dependents, compare both employer and marketplace family rates.`
    ]

    const eligibilityTiming = `
**${state !== 'your state' ? state : 'Your state'} uses ${marketplaceType}** ${isFFE ? '(federally facilitated)' : '(state-based marketplace)'}.

• **Open Enrollment**: Nov 1–Jan 15; coverage starts Jan 1 (or Feb 1 if later).
• **SEP**: 60 days from the qualifying event (or 60 days before a loss of coverage).
• **Important**: If you voluntarily drop an employer plan without a qualifying event, you usually must wait for OE.`

    const nextSteps = [
      "Confirm your employer OE window and family premium.",
      `Check ${marketplaceType} for SEP eligibility (loss of coverage, move, new child, etc.).`,
      "If eligible, apply on marketplace; otherwise set a reminder for OE.",
      "Compare total family costs (employer vs marketplace) before switching.",
      "If marketplace is better, enroll; then coordinate termination of employer coverage to avoid gaps."
    ]

    const scripts: Script[] = [
      {
        channel: 'hr',
        purpose: 'Get employer OE dates & family rates',
        body: `"Hi, I'm comparing employer family coverage with Marketplace options. Can you confirm our OE dates, the monthly premium for family coverage, and whether any plan changes are allowed mid-year without a qualifying event?"`,
        estimatedDuration: '5-10 minutes'
      },
      {
        channel: 'marketplace',
        purpose: 'Check SEP eligibility & APTC',
        body: `"We live in ${state !== 'your state' ? state : '[your state]'}. I'm on employer coverage now${household ? `, ${household.replace('+', ' and ')}` : ''}. I'd like to see if we qualify for a Special Enrollment Period and what ${household ? "my family's" : "my"} APTC/CSR might be."`,
        estimatedDuration: '10-15 minutes'
      }
    ]

    if (payer) {
      scripts.push({
        channel: 'payer',
        purpose: 'Verify current benefits',
        body: `"Hi, I need to verify my current benefits and understand my coverage termination options. My member ID is [YOUR_ID]. Can you explain my current deductible, out-of-pocket maximum, and the process for terminating coverage?"`,
        estimatedDuration: '10-15 minutes'
      })
    }

    const citations: Citation[] = [
      {
        authority: 'Healthcare.gov',
        title: 'Marketplace OE/SEP rules',
        tier: 'federal'
      },
      {
        authority: 'IRS/HHS',
        title: 'Family affordability fix (2023 rule)',
        tier: 'federal'
      }
    ]

    if (state !== 'your state') {
      citations.push({
        authority: state,
        title: `${state} = ${isFFE ? 'Federally-Facilitated' : 'State-Based'} Exchange`,
        tier: 'marketplace'
      })
    }

    return {
      summary,
      options,
      eligibilityTiming,
      whereToGo: links,
      nextSteps,
      scripts,
      citations,
      confidencePill: SlotManager.getConfidenceSummary(frame),
      analyzerNote: contingencies.length > 0 ?
        `**Note**: ${contingencies.join('. ')}.` : undefined
    }
  }

  /**
   * Compose analyzer response for bill analysis
   */
  private static composeAnalyzerResponse(
    input: ComposerInput,
    links: ResourceLink[]
  ): StructuredResponse {
    const { frame } = input
    const state = SlotManager.getSlot(frame, 'state', 0.7)?.value
    const payer = SlotManager.getSlot(frame, 'payer', 0.7)?.value

    const summary = "I'll analyze your medical bill for errors, overcharges, and savings opportunities using our 18-rule detection system."

    const options = [
      "**Bill Error Detection**: Check for duplicate charges, incorrect coding, out-of-network charges that should be in-network.",
      "**EOB Verification**: Compare bill against your explanation of benefits to find discrepancies.",
      "**Cost Savings**: Identify potential savings through corrections, appeals, or payment plan options."
    ]

    const eligibilityTiming = "**Analysis Process**: We'll email your comprehensive report within 24-48 hours. The report includes specific findings, potential savings amounts, and next steps for each detected issue."

    const nextSteps = [
      "Upload all related documents (itemized bill, EOB, insurance card if helpful).",
      "We'll process using OCR and our 18-rule detection engine.",
      "Review the emailed report for specific findings.",
      "Follow provided scripts to dispute errors with your insurance company.",
      "Track your appeals and savings outcomes."
    ]

    const scripts: Script[] = [
      {
        channel: 'payer',
        purpose: 'Dispute billing errors',
        body: `"Hi, I'm calling to dispute charges on a recent claim. My member ID is [YOUR_ID]. I've found [specific errors from your report] and need to file a formal dispute. Can you help me start this process?"`,
        estimatedDuration: '15-20 minutes'
      },
      {
        channel: 'provider',
        purpose: 'Request corrected bill',
        body: `"I've received my bill and found some errors. According to my insurance EOB, [specific discrepancy]. Can you review the charges and send a corrected bill?"`,
        estimatedDuration: '10-15 minutes'
      }
    ]

    const citations: Citation[] = [
      {
        authority: 'WyngAI',
        title: '18-Rule Comprehensive Bill Analysis',
        tier: 'federal'
      }
    ]

    if (state) {
      const doiLink = LinkResolver.getDOILink(state)
      if (doiLink) {
        citations.push({
          authority: `${state} DOI`,
          title: 'Consumer assistance and complaint resolution',
          tier: 'state_doi'
        })
      }
    }

    return {
      summary,
      options,
      eligibilityTiming,
      whereToGo: links,
      nextSteps,
      scripts,
      citations,
      confidencePill: SlotManager.getConfidenceSummary(frame),
      analyzerNote: "**What we check**: Duplicate services, incorrect procedure codes, out-of-network charges, balance billing violations, pricing errors, insurance processing mistakes, and more."
    }
  }

  /**
   * Compose appeal response
   */
  private static composeAppealResponse(
    input: ComposerInput,
    links: ResourceLink[]
  ): StructuredResponse {
    const { frame } = input
    const state = SlotManager.getSlot(frame, 'state', 0.7)?.value || 'your state'
    const payer = SlotManager.getSlot(frame, 'payer', 0.7)?.value || 'your insurance company'

    const summary = `You have the right to appeal your insurance company's decision. ${state !== 'your state' ? state : 'Your state'} provides both internal appeals (with ${payer !== 'your insurance company' ? payer : 'your insurer'}) and external review options.`

    const options = [
      "**Internal Appeal**: File with your insurance company first (usually required before external review).",
      "**External Review**: Independent review by your state if internal appeal is denied.",
      "**Expedited Process**: Available for urgent medical situations that can't wait for standard timelines."
    ]

    const eligibilityTiming = `
**Deadlines**:
• **Internal appeal**: Usually 180 days from denial notice
• **External review**: Usually 60 days after internal appeal denial
• **Expedited**: 72 hours for urgent situations

**Standard Timelines**:
• Internal: 30 days for non-urgent, 72 hours for urgent
• External: 45 days for non-urgent, 72 hours for urgent`

    const nextSteps = [
      "Gather all documentation (denial letter, medical records, provider notes).",
      "File internal appeal with your insurance company first.",
      "If denied, request external review through your state DOI.",
      "Keep detailed records of all communications and deadlines.",
      "Consider medical necessity documentation from your provider."
    ]

    const scripts: Script[] = [
      {
        channel: 'payer',
        purpose: 'File internal appeal',
        body: `"I'm calling to file a formal internal appeal for claim [CLAIM_NUMBER] that was denied on [DATE]. My member ID is [YOUR_ID]. I believe this decision was incorrect because [your reason]. Can you start the appeal process and tell me exactly what documentation you need?"`,
        estimatedDuration: '15-20 minutes'
      }
    ]

    if (state !== 'your state') {
      scripts.push({
        channel: 'marketplace',
        purpose: 'Request external review',
        body: `"I need to file for an external review of my insurance company's appeal denial. The internal appeal was denied on [DATE] for [SERVICE/CLAIM]. Can you help me start the external review process?"`,
        estimatedDuration: '10-15 minutes'
      })
    }

    const citations: Citation[] = [
      {
        authority: 'Federal',
        title: 'ACA Appeals and External Review Rights',
        tier: 'federal'
      }
    ]

    if (state !== 'your state') {
      citations.push({
        authority: `${state} DOI`,
        title: 'External review process and consumer assistance',
        tier: 'state_doi'
      })
    }

    return {
      summary,
      options,
      eligibilityTiming,
      whereToGo: links,
      nextSteps,
      scripts,
      citations,
      confidencePill: SlotManager.getConfidenceSummary(frame)
    }
  }

  /**
   * Compose general response for other scenarios
   */
  private static composeGeneralResponse(
    input: ComposerInput,
    links: ResourceLink[]
  ): StructuredResponse {
    const { frame, themes } = input
    const primaryTheme = themes[0] || 'General Insurance'

    const summary = `I can help you with ${primaryTheme.toLowerCase()}. Based on your situation, here are your key options and next steps.`

    const options = [
      "**Contact your insurance company** for specific plan details and current status.",
      "**Check your state's marketplace** for alternative coverage options.",
      "**Review your plan documents** for detailed benefit information."
    ]

    const eligibilityTiming = "**Important**: Rules and deadlines vary by situation. Always verify specific timelines with your insurance company and state resources."

    const nextSteps = [
      "Contact your insurance company using the customer service number on your ID card.",
      `Review your plan documents for specific ${primaryTheme.toLowerCase()} details.`,
      "Keep detailed records of all communications.",
      "Consider consulting your state's DOI for additional consumer assistance."
    ]

    const scripts: Script[] = [
      {
        channel: 'payer',
        purpose: `Get information about ${primaryTheme.toLowerCase()}`,
        body: `"Hi, I'm calling about my health insurance coverage. My member ID is [YOUR_ID]. I have a question about ${primaryTheme.toLowerCase()}. Can you help me understand my options and any requirements?"`,
        estimatedDuration: '10-15 minutes'
      }
    ]

    const citations: Citation[] = [
      {
        authority: 'Insurance Plan Documents',
        title: `${primaryTheme} information and procedures`,
        tier: 'payer'
      }
    ]

    return {
      summary,
      options,
      eligibilityTiming,
      whereToGo: links,
      nextSteps,
      scripts,
      citations,
      confidencePill: SlotManager.getConfidenceSummary(frame)
    }
  }

  /**
   * Format structured response for display
   */
  static formatResponse(response: StructuredResponse): string {
    let formatted = `## ${response.summary}\n\n`

    // Options
    formatted += `### Your Options Now\n`
    response.options.forEach(option => {
      formatted += `${option}\n\n`
    })

    // Eligibility & Timing
    formatted += `### Eligibility & Timing\n${response.eligibilityTiming}\n\n`

    // Where to Go (Links)
    if (response.whereToGo.length > 0) {
      formatted += `### Where to Go\n`
      formatted += LinkResolver.formatLinksForResponse(response.whereToGo)
      formatted += '\n\n'
    }

    // Next Steps
    formatted += `### Next Steps\n`
    response.nextSteps.forEach((step, index) => {
      formatted += `${index + 1}. ${step}\n`
    })
    formatted += '\n'

    // Scripts
    if (response.scripts.length > 0) {
      formatted += `### Scripts\n`
      response.scripts.forEach(script => {
        formatted += `**${script.channel.toUpperCase()} Script** (${script.purpose}):\n`
        formatted += `${script.body}\n`
        formatted += `*Estimated duration: ${script.estimatedDuration}*\n\n`
      })
    }

    // Analyzer note
    if (response.analyzerNote) {
      formatted += `${response.analyzerNote}\n\n`
    }

    // Citations
    if (response.citations.length > 0) {
      formatted += `### Sources\n`
      response.citations.forEach(citation => {
        formatted += `• **${citation.authority}**: ${citation.title}\n`
      })
      formatted += '\n'
    }

    // Confidence pill
    if (response.confidencePill) {
      formatted += `*Context: ${response.confidencePill}*\n`
    }

    return formatted
  }
}