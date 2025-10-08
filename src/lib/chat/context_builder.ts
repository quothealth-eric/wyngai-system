import { UnifiedChatCase, BenefitsContext, ChatAnswer } from '@/types/chat';
import { PolicyCitation } from '@/types/common';

export class ChatContextBuilder {
  /**
   * Build comprehensive context for LLM from chat case and conversation history
   */
  public buildChatContext(
    chatCase: UnifiedChatCase,
    conversationHistory: ChatAnswer[] = []
  ): string {
    let context = '';

    // System context
    context += this.buildSystemContext();

    // Document context - would be built if documents were available

    // Benefits context - would be built from available benefits data
    context += this.buildBenefitsContext(undefined);

    // Previous conversation context
    if (conversationHistory.length > 0) {
      context += this.buildConversationContext(conversationHistory);
    }

    // Current query context - would be built from user's query
    context += this.buildQueryContext('User healthcare billing question');

    return context;
  }

  /**
   * Build system context with Wyng's healthcare expertise
   */
  private buildSystemContext(): string {
    return `# WYNG HEALTHCARE AI ASSISTANT

You are Wyng's AI assistant specializing in healthcare billing, insurance, and patient advocacy. Your role is to:

1. **Analyze medical bills and insurance documents** with expert-level understanding
2. **Identify billing errors, overcharges, and compliance issues** using evidence-based detection
3. **Provide actionable advice** for patients navigating healthcare costs
4. **Explain complex healthcare policies** in simple terms
5. **Advocate for patient rights** while maintaining professional integrity

## Core Principles:
- **Patient-focused:** Always prioritize patient welfare and financial protection
- **Evidence-based:** Base recommendations on concrete findings and established policies
- **Transparent:** Clearly explain your analysis and reasoning
- **Actionable:** Provide specific, practical steps patients can take
- **Professional:** Maintain appropriate medical/legal boundaries

## Knowledge Base:
- Healthcare billing practices and common errors
- Insurance policy interpretation
- Medical coding (CPT, HCPCS, ICD-10)
- Federal and state healthcare regulations
- Patient rights and advocacy strategies
- No Surprises Act and balance billing protections

---

`;
  }

  /**
   * Build document analysis context from extracted data
   */
  private buildDocumentContext(chatCase: UnifiedChatCase): string {
    // Would use actual document artifact data in real implementation
    return `# DOCUMENT ANALYSIS RESULTS

## Document Information:
- **Type:** Healthcare billing document
- **Processing:** Completed successfully

`;

  }

  /**
   * Build benefits context (limited for no-benefits analysis)
   */
  private buildBenefitsContext(benefitsContext?: BenefitsContext): string {
    let context = `# BENEFITS CONTEXT

`;

    if (benefitsContext?.planType) {
      context += `**Active Benefits:** Yes
**Plan Type:** ${benefitsContext.planType}
**Network Status:** ${benefitsContext.network || 'Unknown'}
`;
    } else {
      context += `**Benefits Status:** No active benefits detected for this analysis.

This is a **no-benefits analysis** focusing on billing accuracy, medical coding compliance, and general healthcare cost issues that can be identified without insurance-specific information.

`;
    }

    return context;
  }

  /**
   * Build conversation history context
   */
  private buildConversationContext(history: ChatAnswer[]): string {
    let context = `# CONVERSATION HISTORY

`;

    history.slice(-3).forEach((answer, index) => {
      context += `## Previous Query ${index + 1}:
**Topic:** Healthcare billing question
**Analysis:** ${answer.answer.substring(0, 200)}...

`;
    });

    return context;
  }

  /**
   * Build current query context
   */
  private buildQueryContext(userMessage: string): string {
    return `# CURRENT QUERY

**User Question:** ${userMessage}

**Your Task:** Provide a comprehensive, actionable response that addresses the user's specific healthcare billing question. Base your analysis on the available document data and apply relevant healthcare policies and regulations.

---

`;
  }
}
