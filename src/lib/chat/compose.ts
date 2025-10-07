import {
  AnswerCard,
  MergedCase,
  ChatResponse,
  PolicyCitation,
  PricedSummary,
  PhoneScript,
  AppealLetter
} from '@/types/qakb';
import { BenefitsContext } from '@/types/chat';

interface CompositionContext {
  mergedCase: MergedCase;
  primaryCard: AnswerCard;
  secondaryCards: AnswerCard[];
  benefits?: BenefitsContext;
  userNarrative: string;
}

export class AnswerComposer {

  async composeAnswer(context: CompositionContext): Promise<ChatResponse> {
    // Extract case facts
    const caseFacts = this.extractCaseFacts(context.mergedCase);

    // Create priced summary
    const pricedSummary = this.createPricedSummary(context.mergedCase);

    // Compose personalized answer
    const personalizedAnswer = this.personalizeAnswer(context.primaryCard, caseFacts, context.benefits);

    // Generate checklist with case-specific items
    const checklist = this.generateChecklist(context.primaryCard, caseFacts, context.benefits);

    // Create phone scripts
    const phoneScripts = this.createPhoneScripts(context.primaryCard, caseFacts);

    // Create appeal letters
    const appealLetters = this.createAppealLetters(context.primaryCard, caseFacts);

    // Consolidate sources from primary and secondary cards
    const sources = this.consolidateSources(context.primaryCard, context.secondaryCards);

    // Calculate confidence scores
    const confidence = this.calculateConfidence(context);

    return {
      answer: personalizedAnswer,
      checklist,
      phoneScripts,
      appealLetters,
      sources,
      pricedSummary,
      confidence
    };
  }

  private extractCaseFacts(mergedCase: MergedCase): Record<string, any> {
    const facts: Record<string, any> = {};

    // Document counts and types
    facts.documentCount = mergedCase.documents.length;
    facts.documentTypes = Array.from(new Set(mergedCase.documents.map(d => d.docType)));
    facts.hasEOB = facts.documentTypes.includes('EOB');
    facts.hasBill = facts.documentTypes.includes('BILL');

    // Financial totals
    if (mergedCase.consolidatedTotals) {
      const totals = mergedCase.consolidatedTotals;
      facts.totalBilled = totals.billed / 100; // Convert from cents
      facts.totalAllowed = totals.allowed / 100;
      facts.totalPlanPaid = totals.planPaid / 100;
      facts.totalPatientResp = totals.patientResp / 100;

      // Calculate percentages
      if (totals.billed > 0) {
        facts.planPaymentPercentage = Math.round((totals.planPaid / totals.billed) * 100);
        facts.patientRespPercentage = Math.round((totals.patientResp / totals.billed) * 100);
      }
    }

    // Line item details
    if (mergedCase.matchedLineItems) {
      facts.lineItemCount = mergedCase.matchedLineItems.length;
      facts.cptCodes = mergedCase.matchedLineItems
        .map(item => item.code?.value)
        .filter(Boolean);
      facts.procedureDescriptions = mergedCase.matchedLineItems
        .map(item => item.description)
        .filter(Boolean);
    }

    // Provider information
    const providers = new Set<string>();
    const npis = new Set<string>();
    const claimIds = new Set<string>();

    mergedCase.documents.forEach(doc => {
      if (doc.header?.providerName) providers.add(doc.header.providerName);
      if (doc.header?.npi) npis.add(doc.header.npi);
      if (doc.header?.claimId) claimIds.add(doc.header.claimId);
    });

    facts.providers = Array.from(providers);
    facts.npis = Array.from(npis);
    facts.claimIds = Array.from(claimIds);

    // Inferred context
    if (mergedCase.inferred) {
      facts.facility = mergedCase.inferred.facility;
      facts.emergency = mergedCase.inferred.emergency;
      facts.nsaCandidate = mergedCase.inferred.nsaCandidate;
      facts.themes = mergedCase.inferred.themes;
    }

    return facts;
  }

  private personalizeAnswer(
    primaryCard: AnswerCard,
    caseFacts: Record<string, any>,
    benefits?: BenefitsContext
  ): string {
    let answer = primaryCard.answer;

    // Replace placeholders with case facts
    const replacements: Record<string, string> = {
      '[TOTAL_BILLED]': caseFacts.totalBilled ? `$${caseFacts.totalBilled.toFixed(2)}` : '[AMOUNT]',
      '[TOTAL_PATIENT_RESP]': caseFacts.totalPatientResp ? `$${caseFacts.totalPatientResp.toFixed(2)}` : '[AMOUNT]',
      '[PROVIDER_NAME]': caseFacts.providers?.[0] || '[PROVIDER]',
      '[CLAIM_ID]': caseFacts.claimIds?.[0] || '[CLAIM_NUMBER]',
      '[LINE_ITEM_COUNT]': caseFacts.lineItemCount?.toString() || '[NUMBER]',
      '[DOCUMENT_COUNT]': caseFacts.documentCount?.toString() || '[NUMBER]'
    };

    for (const [placeholder, replacement] of Object.entries(replacements)) {
      answer = answer.replace(new RegExp(placeholder, 'g'), replacement);
    }

    // Add case-specific context
    let contextAddition = '';

    if (caseFacts.hasEOB && caseFacts.hasBill) {
      contextAddition += ' Based on your EOB and provider bill, ';
    } else if (caseFacts.hasEOB) {
      contextAddition += ' Based on your Explanation of Benefits (EOB), ';
    } else if (caseFacts.hasBill) {
      contextAddition += ' Based on your provider bill, ';
    }

    if (caseFacts.emergency) {
      contextAddition += 'since this involves emergency care, special protections under the No Surprises Act may apply. ';
    }

    if (benefits) {
      if (benefits.planType) {
        contextAddition += `With your ${benefits.planType} plan, `;
      }

      if (benefits.deductible?.individual) {
        const deductibleAmount = benefits.deductible.individual / 100; // Convert from cents
        contextAddition += `your individual deductible is $${deductibleAmount.toFixed(2)}. `;
      }
    }

    // Insert context at the beginning of the second sentence
    if (contextAddition) {
      const sentences = answer.split('. ');
      if (sentences.length > 1) {
        sentences[1] = contextAddition + sentences[1];
        answer = sentences.join('. ');
      } else {
        answer = answer + ' ' + contextAddition;
      }
    }

    return answer;
  }

  private generateChecklist(
    primaryCard: AnswerCard,
    caseFacts: Record<string, any>,
    benefits?: BenefitsContext
  ): string[] {
    const checklist = [...primaryCard.checklist];

    // Add case-specific checklist items
    if (caseFacts.hasEOB && caseFacts.hasBill) {
      checklist.unshift('Compare your EOB amounts to your provider bill amounts');
    }

    if (caseFacts.emergency && caseFacts.nsaCandidate) {
      checklist.push('Check if No Surprises Act protections apply to your emergency care');
      checklist.push('Verify you did not sign a notice and consent form for out-of-network care');
    }

    if (caseFacts.totalPatientResp > 1000) {
      checklist.push('Consider requesting financial assistance or payment plan from the provider');
    }

    if (caseFacts.cptCodes?.length > 0) {
      checklist.push(`Review the specific procedures billed: ${caseFacts.cptCodes.slice(0, 3).join(', ')}`);
    }

    if (benefits?.deductible && benefits.deductible.individual) {
      const deductible = benefits.deductible.individual / 100;
      checklist.push(`Check how much you have paid toward your $${deductible.toFixed(2)} deductible this year`);
    }

    return checklist;
  }

  private createPhoneScripts(primaryCard: AnswerCard, caseFacts: Record<string, any>): PhoneScript[] {
    const baseScript = primaryCard.phoneScript;
    const scripts: PhoneScript[] = [];

    // Primary script with case facts
    let personalizedScript = baseScript
      .replace(/\[CLAIM_NUMBER\]/g, caseFacts.claimIds?.[0] || 'my claim number')
      .replace(/\[PROVIDER\]/g, caseFacts.providers?.[0] || 'the provider')
      .replace(/\[DATE\]/g, 'the recent service date')
      .replace(/\[SERVICE_TYPE\]/g, caseFacts.procedureDescriptions?.[0] || 'the services I received');

    scripts.push({
      title: 'Primary Insurance Inquiry',
      body: personalizedScript
    });

    // Additional scripts based on case context
    if (caseFacts.hasEOB && caseFacts.hasBill) {
      scripts.push({
        title: 'EOB and Bill Discrepancy',
        body: `Hi, I'm comparing my EOB to my provider bill and the amounts don't match. My EOB shows ${caseFacts.totalPlanPaid ? `$${caseFacts.totalPlanPaid.toFixed(2)} paid` : 'a payment amount'} but my bill shows ${caseFacts.totalPatientResp ? `$${caseFacts.totalPatientResp.toFixed(2)} due` : 'a different amount due'}. Can you help me understand the difference?`
      });
    }

    if (caseFacts.nsaCandidate) {
      scripts.push({
        title: 'No Surprises Act Protection',
        body: `Hi, I received what appears to be a surprise medical bill for services on [DATE] at ${caseFacts.providers?.[0] || '[FACILITY_NAME]'}. I believe I may be protected under the No Surprises Act. Can you review this claim and confirm what patient protections apply?`
      });
    }

    return scripts;
  }

  private createAppealLetters(primaryCard: AnswerCard, caseFacts: Record<string, any>): AppealLetter[] {
    const baseSnippet = primaryCard.appealSnippet;
    const letters: AppealLetter[] = [];

    // Primary appeal letter
    let personalizedAppeal = baseSnippet
      .replace(/\[CLAIM_NUMBER\]/g, caseFacts.claimIds?.[0] || '[CLAIM_NUMBER]')
      .replace(/\[DATE\]/g, '[SERVICE_DATE]')
      .replace(/\[SPECIFIC_ISSUE\]/g, 'the coverage determination for the services listed above');

    letters.push({
      title: 'Formal Appeal Letter',
      body: `Dear Appeals Review Team,

${personalizedAppeal}

The services in question include:
${caseFacts.procedureDescriptions?.slice(0, 3).map((desc: string, i: number) => `- ${desc} (${caseFacts.cptCodes?.[i] || 'CPT code'})`).join('\n') || '- [SERVICE_DESCRIPTIONS]'}

Total charges: ${caseFacts.totalBilled ? `$${caseFacts.totalBilled.toFixed(2)}` : '$[AMOUNT]'}
Amount in dispute: ${caseFacts.totalPatientResp ? `$${caseFacts.totalPatientResp.toFixed(2)}` : '$[AMOUNT]'}

Please provide a detailed written response explaining the basis for your determination and any additional documentation needed to support my appeal.

Sincerely,
[YOUR_NAME]
[DATE]`
    });

    // No Surprises Act appeal if applicable
    if (caseFacts.nsaCandidate) {
      letters.push({
        title: 'No Surprises Act Protection Appeal',
        body: `Dear Claims Review Department,

I am formally disputing the balance billing for services received on [DATE] at ${caseFacts.providers?.[0] || '[FACILITY_NAME]'}. Under the No Surprises Act (21st Century Cures Act Section 2799A-1), I believe I am protected from these surprise medical bills.

The circumstances of my care meet the criteria for No Surprises Act protection because [SELECT APPLICABLE]:
☐ This was emergency care at an out-of-network facility
☐ This was non-emergency care by an out-of-network provider at an in-network facility
☐ I did not receive proper notice and consent forms 72 hours in advance

I request that you:
1. Apply No Surprises Act protections to this claim
2. Process payment at the in-network rate
3. Remove any balance billing charges from my responsibility

Please provide written confirmation of your determination within 30 days.

Sincerely,
[YOUR_NAME]
Member ID: [MEMBER_ID]
Claim Number: ${caseFacts.claimIds?.[0] || '[CLAIM_NUMBER]'}`
      });
    }

    return letters;
  }

  private createPricedSummary(mergedCase: MergedCase): PricedSummary | undefined {
    if (!mergedCase.consolidatedTotals) return undefined;

    // Extract header information from first document
    const firstDoc = mergedCase.documents[0];
    const header = firstDoc?.header;

    const totals = mergedCase.consolidatedTotals;

    const summary: PricedSummary = {
      header: {
        providerName: header?.providerName,
        NPI: header?.npi,
        claimId: header?.claimId,
        accountId: header?.accountId,
        dos: header?.serviceDates ? {
          start: header.serviceDates.start,
          end: header.serviceDates.end
        } : undefined,
        payer: 'Insurance Carrier' // Could be extracted from OCR in real implementation
      },
      totals: {
        billed: totals.billed,
        allowed: totals.allowed,
        planPaid: totals.planPaid,
        patientResp: totals.patientResp
      }
    };

    // Add line items if available
    if (mergedCase.matchedLineItems && mergedCase.matchedLineItems.length > 0) {
      summary.lines = mergedCase.matchedLineItems.map(item => ({
        lineId: item.lineId,
        code: item.code?.value,
        modifiers: item.modifiers,
        desc: item.description,
        units: item.units,
        charge: item.charges?.billed,
        allowed: item.charges?.allowed,
        planPaid: item.charges?.planPaid,
        patientResp: item.charges?.patientResp,
        conf: item.confidence
      }));
    }

    return summary;
  }

  private consolidateSources(primaryCard: AnswerCard, secondaryCards: AnswerCard[]): PolicyCitation[] {
    const seenCitations = new Set<string>();
    const citations: PolicyCitation[] = [];

    // Add primary card sources
    for (const source of primaryCard.sources) {
      const key = `${source.authority}-${source.title}`;
      if (!seenCitations.has(key)) {
        seenCitations.add(key);
        citations.push(source);
      }
    }

    // Add secondary card sources (limit to avoid overwhelming)
    for (const card of secondaryCards.slice(0, 2)) {
      for (const source of card.sources) {
        const key = `${source.authority}-${source.title}`;
        if (!seenCitations.has(key) && citations.length < 8) {
          seenCitations.add(key);
          citations.push(source);
        }
      }
    }

    // Sort by authority hierarchy: Federal -> CMS -> StateDOI -> PayerPolicy
    const authorityOrder = { 'Federal': 1, 'CMS': 2, 'StateDOI': 3, 'PayerPolicy': 4 };
    citations.sort((a, b) => authorityOrder[a.authority] - authorityOrder[b.authority]);

    return citations;
  }

  private calculateConfidence(context: CompositionContext): ChatResponse['confidence'] {
    const { mergedCase, primaryCard } = context;

    // Base confidence from card
    let overallConfidence = primaryCard.meta.confidence;

    // OCR confidence impact
    const avgOcrConf = mergedCase.documents.reduce((sum, doc) => sum + doc.ocrConf, 0) / mergedCase.documents.length;
    const ocrConfidence = avgOcrConf;

    // Adjust overall confidence based on OCR quality
    overallConfidence *= (0.5 + 0.5 * avgOcrConf); // Scale by OCR confidence

    // Boost confidence for case-specific matches
    if (mergedCase.inferred?.nsaCandidate && primaryCard.theme === 'OON/Balance Billing') {
      overallConfidence += 0.1;
    }

    if (mergedCase.documents.length > 1 && primaryCard.theme.includes('Claims')) {
      overallConfidence += 0.05;
    }

    // Ensure confidence stays within bounds
    overallConfidence = Math.max(0.3, Math.min(1.0, overallConfidence));

    return {
      overall: Math.round(overallConfidence * 100) / 100,
      ocr: Math.round(ocrConfidence * 100) / 100,
      classification: Math.round(primaryCard.meta.confidence * 100) / 100
    };
  }
}

export const answerComposer = new AnswerComposer();