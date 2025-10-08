import { UnifiedChatCase, ChatAnswer, BenefitsContext } from '@/types/chat';
import { ChatImageProcessor } from './image_processor';
import { ChatContextBuilder } from './context_builder';
import { PolicyCitation } from '@/types/common';

export class UnifiedChatEngine {
  private imageProcessor = new ChatImageProcessor();
  private contextBuilder = new ChatContextBuilder();
  private conversationHistory: ChatAnswer[] = [];

  /**
   * Process text-only question without image upload
   */
  public async processTextQuery(
    userMessage: string,
    benefitsContext?: BenefitsContext
  ): Promise<ChatAnswer> {
    console.log('💬 Processing text query...');

    const chatCase: UnifiedChatCase = {
      caseId: `text_case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      artifacts: [],
      narrative: {
        text: userMessage,
        themeHints: []
      }
    };

    return await this.generateChatResponse(chatCase);
  }

  /**
   * Process image upload with optional accompanying message
   */
  public async processImageUpload(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    userMessage?: string,
    benefitsContext?: BenefitsContext
  ): Promise<ChatAnswer> {
    console.log('🖼️ Processing image upload...');

    // Process the document using the image processor
    const chatCase = await this.imageProcessor.processUploadedDocument(
      buffer,
      filename,
      mimeType,
      userMessage
    );

    // Benefits context would be used in real implementation

    return await this.generateChatResponse(chatCase);
  }

  /**
   * Follow-up question about a previously analyzed document
   */
  public async processFollowUpQuery(
    userMessage: string,
    previousChatCase: UnifiedChatCase
  ): Promise<ChatAnswer> {
    console.log('🔄 Processing follow-up query...');

    // Create new chat case based on previous analysis
    const chatCase: UnifiedChatCase = {
      ...previousChatCase,
      narrative: {
        text: userMessage,
        themeHints: []
      }
    };

    return await this.generateChatResponse(chatCase);
  }

  /**
   * Generate LLM response using comprehensive context
   */
  private async generateChatResponse(chatCase: UnifiedChatCase): Promise<ChatAnswer> {
    try {
      // Build comprehensive context for LLM
      const context = this.contextBuilder.buildChatContext(chatCase, this.conversationHistory);

      // Extract relevant policy citations (would be implemented)
      const citations: any[] = [];

      // Simulate LLM call (in production, would call Claude/GPT API)
      const answer = await this.simulateLLMResponse(context, chatCase);

      // Create chat answer
      const chatAnswer: ChatAnswer = {
        caseId: chatCase.caseId,
        answer,
        checklist: [],
        phoneScripts: [],
        appealLetters: [],
        sources: citations,
        confidence: { overall: this.calculateResponseConfidence(chatCase) }
      };

      // Add to conversation history (keep last 10 exchanges)
      this.conversationHistory.push(chatAnswer);
      if (this.conversationHistory.length > 10) {
        this.conversationHistory = this.conversationHistory.slice(-10);
      }

      console.log(`✅ Chat response generated (${answer.length} chars)`);
      return chatAnswer;

    } catch (error) {
      console.error('❌ Chat response generation failed:', error);

      return {
        caseId: chatCase.caseId,
        answer: `I apologize, but I encountered an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again or contact support if the issue persists.`,
        checklist: [],
        phoneScripts: [],
        appealLetters: [],
        sources: [],
        confidence: { overall: 0 }
      } as ChatAnswer;
    }
  }

  /**
   * Simulate LLM response (replace with actual API call in production)
   */
  private async simulateLLMResponse(context: string, chatCase: UnifiedChatCase): Promise<string> {
    // In production, this would make an API call to Claude or GPT
    // For this implementation, we'll return a structured response based on the context

    if (chatCase.artifacts && chatCase.artifacts.length > 0) {
      return this.generateDocumentAnalysisResponse(chatCase);
    } else {
      return this.generateTextQueryResponse(chatCase);
    }
  }

  private generateDocumentAnalysisResponse(chatCase: UnifiedChatCase): string {
    const artifact = chatCase.artifacts[0];
    // Would use actual extracted data in real implementation

    let response = `# Document Analysis Complete\n\n`;

    response += `**Document Analysis Complete**. I've successfully processed your ${artifact.docType.toLowerCase()} document.\n\n`;

    response += `## Summary:\n`;
    response += `✅ **Document processed** successfully\n`;
    response += `✅ **Analysis complete** - Ready for review\n\n`;

    response += `## What This Means:\n`;
    response += `Your document has been analyzed and is ready for further review. You can ask me specific questions about the content or request more detailed analysis.\n\n`;

    response += `## Next Steps:\n\n`;
    response += `1. **Keep this analysis** for your records\n`;
    response += `2. **Contact me** if you have specific questions about any charges\n`;
    response += `3. **Ask for clarification** on any services you don't recognize\n\n`;

    response += `## Questions?\n`;
    response += `Feel free to ask me about any specific charges, procedures, or billing terms you don't understand. I'm here to help you navigate your healthcare costs!\n`;

    return response;
  }

  private generateTextQueryResponse(chatCase: UnifiedChatCase): string {
    const message = chatCase.narrative.text.toLowerCase();

    // Pattern-based responses for common questions
    if (message.includes('balance billing') || message.includes('surprise bill')) {
      return this.generateBalanceBillingResponse();
    }

    if (message.includes('appeal') || message.includes('dispute')) {
      return this.generateAppealGuidanceResponse();
    }

    if (message.includes('deductible') || message.includes('copay') || message.includes('coinsurance')) {
      return this.generateInsuranceTermsResponse();
    }

    if (message.includes('medical necessity') || message.includes('denied')) {
      return this.generateMedicalNecessityResponse();
    }

    // Generic helpful response
    return `# Healthcare Billing Assistance\n\n` +
           `I'm here to help you understand and navigate healthcare billing issues. I can:\n\n` +
           `📋 **Analyze medical bills** for errors and overcharges\n` +
           `💰 **Identify potential savings** through billing error detection\n` +
           `📚 **Explain billing terms** and insurance concepts\n` +
           `⚖️ **Guide you through appeals** and dispute processes\n` +
           `🛡️ **Protect your rights** as a healthcare consumer\n\n` +
           `## How to Get Started:\n\n` +
           `1. **Upload a document** (bill, EOB, insurance letter) for analysis\n` +
           `2. **Ask specific questions** about charges or billing terms\n` +
           `3. **Get guidance** on appeals and dispute processes\n\n` +
           `What specific healthcare billing question can I help you with today?`;
  }

  private generateBalanceBillingResponse(): string {
    return `# Balance Billing Protection\n\n` +
           `The **No Surprises Act** protects you from unexpected medical bills in many situations.\n\n` +
           `## You're Protected From Balance Billing When:\n` +
           `✅ Getting emergency care at any hospital\n` +
           `✅ Receiving care from out-of-network providers at in-network facilities\n` +
           `✅ Getting air ambulance services\n\n` +
           `## If You Receive a Surprise Bill:\n` +
           `1. **Don't pay immediately** - you have rights\n` +
           `2. **Contact your insurance** to verify the claim\n` +
           `3. **File a complaint** with federal agencies if needed\n` +
           `4. **Request an independent dispute resolution** if applicable\n\n` +
           `Would you like me to analyze a specific bill to check for balance billing violations?`;
  }

  private generateAppealGuidanceResponse(): string {
    return `# Medical Bill Appeal Process\n\n` +
           `You have the right to appeal medical bills and insurance denials.\n\n` +
           `## Internal Appeal Process:\n` +
           `1. **Contact your insurance** within 180 days of the denial\n` +
           `2. **Submit written appeal** with supporting documentation\n` +
           `3. **Include medical records** that support medical necessity\n` +
           `4. **Wait for decision** (usually 30-60 days)\n\n` +
           `## External Appeal (if internal fails):\n` +
           `1. **Request external review** from independent organization\n` +
           `2. **Provide all documentation** from internal appeal\n` +
           `3. **Wait for binding decision** (usually 45 days)\n\n` +
           `## For Provider Billing Disputes:\n` +
           `1. **Contact the provider** directly first\n` +
           `2. **Request itemized bill** with detailed codes\n` +
           `3. **File complaint** with state insurance commissioner if needed\n\n` +
           `Do you have a specific denial or bill you'd like help appealing?`;
  }

  private generateInsuranceTermsResponse(): string {
    return `# Understanding Insurance Terms\n\n` +
           `Let me explain common insurance cost-sharing terms:\n\n` +
           `## **Deductible**\n` +
           `💰 Amount you pay **before** insurance starts covering costs\n` +
           `📅 Usually resets annually\n\n` +
           `## **Copay**\n` +
           `💳 **Fixed amount** you pay for specific services\n` +
           `🏥 Example: $25 for office visits\n\n` +
           `## **Coinsurance**\n` +
           `📊 **Percentage** of costs you pay after deductible\n` +
           `🧮 Example: You pay 20%, insurance pays 80%\n\n` +
           `## **Out-of-Pocket Maximum**\n` +
           `🛡️ **Most you'll pay** in a year for covered services\n` +
           `✋ After reaching this, insurance pays 100%\n\n` +
           `## Typical Payment Order:\n` +
           `1. You pay deductible first\n` +
           `2. Then copays or coinsurance\n` +
           `3. Until you reach out-of-pocket max\n\n` +
           `Would you like me to analyze a bill to show how these terms apply to your specific situation?`;
  }

  private generateMedicalNecessityResponse(): string {
    return `# Medical Necessity and Denials\n\n` +
           `Insurance companies can deny claims if they determine services aren't "medically necessary."\n\n` +
           `## What Makes Services Medically Necessary:\n` +
           `✅ **Appropriate** for your symptoms/condition\n` +
           `✅ **Effective** treatment for your diagnosis\n` +
           `✅ **Not experimental** or investigational\n` +
           `✅ **Not primarily for convenience**\n\n` +
           `## Common Denial Reasons:\n` +
           `❌ **Lack of documentation** supporting necessity\n` +
           `❌ **Experimental procedures** not proven effective\n` +
           `❌ **Duplicative services** already provided\n` +
           `❌ **Incorrect coding** that doesn't match diagnosis\n\n` +
           `## Fighting Medical Necessity Denials:\n` +
           `1. **Get detailed reason** from insurance company\n` +
           `2. **Request medical records** from your provider\n` +
           `3. **Have provider submit additional documentation**\n` +
           `4. **File formal appeal** if initial request fails\n` +
           `5. **Consider external review** for complex cases\n\n` +
           `Would you like help analyzing a specific denial letter or understanding why a claim was rejected?`;
  }

  private calculateResponseConfidence(chatCase: UnifiedChatCase): number {
    let confidence = 0.8; // Base confidence

    // Adjust based on document availability
    if (chatCase.artifacts && chatCase.artifacts.length > 0) {
      confidence = Math.min(confidence, 0.85); // Assume good quality OCR
    }

    // Adjust based on query complexity
    if (chatCase.narrative.text.length < 10) {
      confidence *= 0.9; // Slightly lower for very short queries
    }

    // Adjust based on question complexity
    const complexTerms = ['appeal', 'medical necessity', 'balance billing', 'surprise bill'];
    const hasComplexTerms = complexTerms.some(term =>
      chatCase.narrative.text.toLowerCase().includes(term)
    );

    if (hasComplexTerms) {
      confidence *= 1.1; // Higher for questions we're designed to handle
    }

    return Math.min(1.0, Math.max(0.1, confidence));
  }

  /**
   * Clear conversation history
   */
  public clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   */
  public getHistory(): ChatAnswer[] {
    return [...this.conversationHistory];
  }
}