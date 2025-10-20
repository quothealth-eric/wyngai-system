/**
 * WyngAI Central Assistant - Answer Composer
 * Compose structured, cited answers using retrieved RAG content
 */

import OpenAI from 'openai';
import {
  ChatResponse,
  RetrievalResult,
  ExtractedEntities,
  ChatContext,
  Citation,
  Script,
  Form,
  Calculation
} from '@/lib/types/rag';

interface JargonDefinition {
  term: string;
  definition: string;
  example?: string;
}

interface ActionableLink {
  text: string;
  url: string;
  description: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export class AnswerComposer {
  private insuranceJargon: Record<string, JargonDefinition> = {
    'deductible': {
      term: 'Deductible',
      definition: 'The amount you pay out-of-pocket before your insurance starts covering costs',
      example: 'If you have a $1,000 deductible, you pay the first $1,000 of covered medical expenses each year'
    },
    'coinsurance': {
      term: 'Coinsurance',
      definition: 'Your share of costs after meeting your deductible, usually expressed as a percentage',
      example: 'With 20% coinsurance, you pay 20% and insurance pays 80% of covered costs after your deductible'
    },
    'copay': {
      term: 'Copay',
      definition: 'A fixed amount you pay for covered services, usually at the time of service',
      example: 'A $25 copay means you pay $25 for a doctor visit, regardless of the total cost'
    },
    'out-of-pocket maximum': {
      term: 'Out-of-Pocket Maximum',
      definition: 'The most you pay for covered services in a year. After you reach this amount, insurance pays 100%',
      example: 'With a $5,000 out-of-pocket max, once you\'ve paid $5,000 in deductibles and coinsurance, insurance covers everything else'
    },
    'prior authorization': {
      term: 'Prior Authorization',
      definition: 'Approval you need from your insurance before getting certain treatments or medications',
      example: 'Your doctor requests prior authorization for an MRI to ensure insurance will cover it'
    },
    'eob': {
      term: 'EOB (Explanation of Benefits)',
      definition: 'A statement from your insurance explaining what was covered and what you owe',
      example: 'Your EOB shows the doctor charged $200, insurance paid $150, and you owe $50'
    },
    'in-network': {
      term: 'In-Network',
      definition: 'Doctors and facilities that have contracts with your insurance for reduced rates',
      example: 'Using in-network providers typically costs less because they have negotiated rates with your insurer'
    },
    'out-of-network': {
      term: 'Out-of-Network',
      definition: 'Providers without contracts with your insurance, usually resulting in higher costs',
      example: 'Out-of-network care might cost you 40-60% instead of 20% coinsurance'
    },
    'formulary': {
      term: 'Formulary',
      definition: 'Your insurance plan\'s list of covered prescription drugs',
      example: 'If your medication isn\'t on the formulary, you might pay full price or need prior authorization'
    },
    'nsa': {
      term: 'No Surprises Act (NSA)',
      definition: 'Federal law protecting you from unexpected out-of-network bills in emergencies and certain situations',
      example: 'If you go to an in-network hospital but see an out-of-network doctor, NSA may protect you from surprise bills'
    },
    'balance billing': {
      term: 'Balance Billing',
      definition: 'When a provider bills you for the difference between their charge and what insurance paid',
      example: 'Doctor charges $300, insurance pays $200, provider bills you the $100 difference'
    },
    'allowed amount': {
      term: 'Allowed Amount',
      definition: 'The maximum amount your insurance will pay for a covered service',
      example: 'If the allowed amount is $150 but the provider charges $200, you might only be responsible for costs based on the $150'
    },
    'claim': {
      term: 'Claim',
      definition: 'A request for payment submitted to your insurance for medical services you received',
      example: 'After your doctor visit, the office submits a claim to your insurance for the services provided'
    },
    'appeal': {
      term: 'Appeal',
      definition: 'A formal request to review an insurance company\'s decision to deny coverage or payment',
      example: 'If insurance denies your MRI, you can file an appeal with documentation of medical necessity'
    },
    'carc': {
      term: 'CARC (Claim Adjustment Reason Code)',
      definition: 'Standardized codes explaining why a claim was denied or adjusted',
      example: 'CARC 16 means "Claim lacks information or has submission/billing error"'
    },
    'rarc': {
      term: 'RARC (Remittance Advice Remark Code)',
      definition: 'Additional codes providing more specific information about claim processing',
      example: 'RARC N130 means "Consult plan benefit documents/guidelines for information about restrictions"'
    },
    'npi': {
      term: 'NPI (National Provider Identifier)',
      definition: 'A unique 10-digit number that identifies healthcare providers',
      example: 'Your doctor\'s NPI helps insurance verify they are a legitimate healthcare provider'
    },
    'cpt code': {
      term: 'CPT Code',
      definition: 'Standardized codes describing medical procedures and services for billing',
      example: 'CPT 99213 is the code for a standard office visit with your primary care doctor'
    },
    'hcpcs': {
      term: 'HCPCS Code',
      definition: 'Healthcare Common Procedure Coding System - codes for services, supplies, and equipment',
      example: 'HCPCS codes cover things like ambulance services, durable medical equipment, and some medications'
    }
  };

  private actionableLinks: Record<string, ActionableLink[]> = {
    'appeal_process': [
      {
        text: 'Find your state\'s external review process',
        url: 'https://www.healthcare.gov/appeal-insurance-company-decision/external-review/',
        description: 'Official guide to external review when internal appeals are exhausted'
      },
      {
        text: 'Sample appeal letter templates',
        url: 'https://www.patientadvocate.org/explore-resources/appeals-and-denials/',
        description: 'Free templates for writing effective appeal letters'
      }
    ],
    'billing_question': [
      {
        text: 'Request itemized bills',
        url: 'https://www.healthcare.gov/blog/understanding-medical-debt/',
        description: 'How to request detailed itemized bills from providers'
      },
      {
        text: 'Negotiate medical bills',
        url: 'https://www.consumerfinance.gov/ask-cfpb/what-should-i-do-if-i-cannot-afford-to-pay-a-medical-bill-en-1699/',
        description: 'Government guide to negotiating and managing medical debt'
      }
    ],
    'network_check': [
      {
        text: 'Verify provider network status',
        url: 'https://www.healthcare.gov/using-marketplace-coverage/getting-care/',
        description: 'Tips for confirming if providers are in your network'
      }
    ],
    'prior_auth': [
      {
        text: 'Understanding prior authorization',
        url: 'https://www.healthcare.gov/glossary/prior-authorization/',
        description: 'Official explanation of prior authorization requirements'
      }
    ],
    'nsa_protection': [
      {
        text: 'File a No Surprises Act complaint',
        url: 'https://www.cms.gov/nosurprises/consumers/file-a-complaint',
        description: 'Official government portal for filing NSA complaints'
      },
      {
        text: 'Know your rights under No Surprises Act',
        url: 'https://www.cms.gov/nosurprises',
        description: 'Comprehensive information about your protection from surprise bills'
      }
    ],
    'state_resources': [
      {
        text: 'Find your state insurance department',
        url: 'https://content.naic.org/consumer/contact-your-state-insurance-regulator',
        description: 'Contact information for your state\'s insurance regulator'
      }
    ],
    'general_help': [
      {
        text: 'Get free help from a patient navigator',
        url: 'https://www.patientadvocate.org/connect-with-services/',
        description: 'Free assistance from trained patient advocates'
      },
      {
        text: 'Health insurance literacy resources',
        url: 'https://www.healthcare.gov/glossary/',
        description: 'Comprehensive glossary of health insurance terms'
      }
    ]
  };

  /**
   * Compose a comprehensive answer using retrieved content
   */
  async composeAnswer(
    query: string,
    entities: ExtractedEntities,
    retrievalResult: RetrievalResult,
    context: ChatContext
  ): Promise<ChatResponse> {
    console.log('✍️ Composing answer using', retrievalResult.sections.length, 'retrieved sections');

    // Check if we have sufficient information to answer
    const confidence = this.assessConfidence(retrievalResult, entities);

    if (confidence < 0.6) {
      return this.generateClarificationResponse(query, entities, context);
    }

    // Build comprehensive prompt with retrieved content
    const systemPrompt = this.buildAnswerPrompt(entities, context);
    const userPrompt = this.buildUserPrompt(query, retrievalResult, entities, context);

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        functions: [{
          name: 'compose_insurance_answer',
          description: 'Compose a comprehensive insurance answer with citations and next steps',
          parameters: {
            type: 'object',
            properties: {
              answer: {
                type: 'string',
                description: 'Clear, plain-English answer with jargon definitions in parentheses and step-by-step guidance for laypeople'
              },
              jargon_explanations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    term: { type: 'string' },
                    definition: { type: 'string' },
                    context: { type: 'string' }
                  },
                  required: ['term', 'definition']
                },
                description: 'Explanations of insurance jargon used in the answer'
              },
              actionable_links: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    url: { type: 'string' },
                    description: { type: 'string' }
                  },
                  required: ['text', 'url']
                },
                description: 'Helpful links for users to take action on their situation'
              },
              citations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    authority: { type: 'string' },
                    title: { type: 'string' },
                    section_or_policy_id: { type: 'string' },
                    eff_date: { type: 'string' },
                    excerpt: { type: 'string' }
                  },
                  required: ['authority', 'title']
                },
                description: 'Citations from authoritative sources'
              },
              next_steps: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific action items for the user'
              },
              scripts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    channel: { type: 'string', enum: ['payer', 'provider', 'employer', 'state_doi', 'marketplace'] },
                    purpose: { type: 'string' },
                    body: { type: 'string' },
                    estimated_duration: { type: 'string' }
                  },
                  required: ['channel', 'purpose', 'body']
                },
                description: 'Phone scripts for contacting relevant parties'
              },
              forms: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    required_info: {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  },
                  required: ['name', 'description']
                },
                description: 'Relevant forms or documents needed'
              },
              calc: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  inputs: { type: 'object' },
                  result: { type: 'object' },
                  explanation: { type: 'string' },
                  assumptions: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                },
                description: 'Financial calculations if applicable'
              },
              confidence_level: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Confidence in the answer based on available sources'
              }
            },
            required: ['answer', 'citations', 'next_steps', 'confidence_level', 'jargon_explanations', 'actionable_links']
          }
        }],
        function_call: { name: 'compose_insurance_answer' },
        temperature: 0.2
      });

      const functionCall = response.choices[0].message.function_call;
      if (functionCall?.arguments) {
        const composedAnswer = JSON.parse(functionCall.arguments);

        // Validate and enhance the response
        const enhancedAnswer = this.enhanceAnswerWithJargonAndLinks(
          composedAnswer.answer,
          composedAnswer.jargon_explanations || [],
          entities.intent || 'general_question'
        );

        const chatResponse: ChatResponse = {
          answer: enhancedAnswer.answer,
          citations: this.enhanceCitations(composedAnswer.citations, retrievalResult),
          nextSteps: composedAnswer.next_steps || [],
          scripts: composedAnswer.scripts || [],
          forms: composedAnswer.forms || [],
          calc: composedAnswer.calc,
          confidence: this.mapConfidenceLevel(composedAnswer.confidence_level),
          authorities_used: retrievalResult.authorities_used,
          jargonExplanations: enhancedAnswer.jargonExplanations,
          actionableLinks: enhancedAnswer.actionableLinks
        };

        console.log('✅ Answer composed with', chatResponse.citations.length, 'citations');
        return chatResponse;
      }
    } catch (error) {
      console.error('Error composing answer:', error);
    }

    // Fallback response
    return this.generateFallbackResponse(query, retrievalResult, entities);
  }

  /**
   * Generate clarification response when confidence is low
   */
  private generateClarificationResponse(
    query: string,
    entities: ExtractedEntities,
    context: ChatContext
  ): ChatResponse {
    const missingInfo: string[] = [];

    if (!entities.planType && !context.planInputs?.planType) {
      missingInfo.push('your plan type (HMO, PPO, EPO, HDHP)');
    }
    if (!entities.state && !context.planInputs?.state) {
      missingInfo.push('your state');
    }

    const clarificationQuestion = `I'd be happy to help with your insurance question! To give you the most accurate information, I need to know ${missingInfo.join(' and ')}.

Could you share these details so I can provide specific guidance for your situation?`;

    return {
      answer: clarificationQuestion,
      citations: [],
      nextSteps: ['Provide your plan type and state for accurate guidance'],
      scripts: [],
      forms: [],
      confidence: 0.9, // High confidence in needing clarification
      authorities_used: [],
      clarification: {
        question: clarificationQuestion,
        intent: 'collect_plan_info',
        options: entities.planType ? undefined : ['HMO', 'PPO', 'EPO', 'HDHP', 'POS']
      }
    };
  }

  /**
   * Build system prompt for answer composition
   */
  private buildAnswerPrompt(entities: ExtractedEntities, context: ChatContext): string {
    return `You are WyngAI, a specialized health insurance assistant. Your role is to provide accurate, actionable guidance on insurance questions using authoritative sources.

GUIDELINES:
- Provide clear, step-by-step guidance in plain English
- Always cite your sources with specific references
- Include practical next steps and phone scripts when helpful
- Focus on what the user can DO, not just explanations
- Acknowledge limitations and when to seek additional help
- Never provide legal advice - guide users to appropriate resources
- EXPLAIN JARGON: When using insurance terms, provide clear definitions for laypeople
- PROVIDE LINKS: Include actionable links to help users perform resolution steps
- HAND-HOLD: Guide users through complex processes step-by-step

ANSWER STRUCTURE:
1. Direct answer to the question with key points
2. Relevant background/context if needed
3. Specific action steps the user can take
4. Phone scripts for contacting insurers/providers
5. Forms or documents they may need

CITATION RULES:
- Always prefer federal/CMS sources for regulatory questions
- Use state DOI sources for appeal timelines and procedures
- Reference payer policies for coverage criteria
- Include effective dates when available
- Quote specific regulatory text when relevant

STYLE:
- Short paragraphs and bullet points
- Phone scripts: 110-150 words, conversational tone
- Explain technical terms in parentheses
- Use "you" to address the user directly
- Be empathetic but professional

${context.planInputs ? `
USER CONTEXT:
- Plan Type: ${context.planInputs.planType || 'Unknown'}
- State: ${context.planInputs.state || 'Unknown'}
- Plan Name: ${context.planInputs.planName || 'Unknown'}
` : ''}

${context.collectedFacts ? `
PREVIOUS CONVERSATION FACTS:
${JSON.stringify(context.collectedFacts, null, 2)}
` : ''}

Remember: You are not providing legal advice, but helping users navigate their insurance benefits and processes.`;
  }

  /**
   * Build user prompt with retrieved content
   */
  private buildUserPrompt(
    query: string,
    retrievalResult: RetrievalResult,
    entities: ExtractedEntities,
    context: ChatContext
  ): string {
    let prompt = `QUESTION: ${query}\n\n`;

    if (entities.intent) {
      prompt += `DETECTED INTENT: ${entities.intent}\n`;
    }

    if (entities.planType || entities.state) {
      prompt += `EXTRACTED INFO: Plan: ${entities.planType || 'Unknown'}, State: ${entities.state || 'Unknown'}\n`;
    }

    prompt += `\nAUTHORITATIVE SOURCES (${retrievalResult.sections.length} sections):\n\n`;

    // Group sources by authority for better organization
    const sourcesByAuthority = retrievalResult.sections.reduce((acc, section) => {
      const authority = section.document.authority;
      if (!acc[authority]) acc[authority] = [];
      acc[authority].push(section);
      return acc;
    }, {} as Record<string, typeof retrievalResult.sections>);

    Object.entries(sourcesByAuthority).forEach(([authority, sections]) => {
      prompt += `=== ${authority.toUpperCase()} SOURCES ===\n`;
      sections.forEach((section, index) => {
        prompt += `[${authority.toUpperCase()}-${index + 1}] ${section.document.title}\n`;
        if (section.document.eff_date) {
          prompt += `Effective: ${section.document.eff_date}\n`;
        }
        if (section.section.section_path) {
          prompt += `Section: ${section.section.section_path}\n`;
        }
        prompt += `Content: ${section.section.text.substring(0, 800)}${section.section.text.length > 800 ? '...' : ''}\n\n`;
      });
    });

    prompt += `\nUsing these authoritative sources, provide a comprehensive answer that includes:
1. Clear answer to the user's question
2. Specific next steps they can take
3. Citations to the relevant sources above
4. Phone scripts if contacting insurers/providers would help
5. Any relevant forms or documents needed

Be specific and actionable. If the sources don't fully answer the question, explain what additional information would be needed.`;

    return prompt;
  }

  /**
   * Assess confidence based on retrieval quality
   */
  private assessConfidence(retrievalResult: RetrievalResult, entities: ExtractedEntities): number {
    if (retrievalResult.sections.length === 0) return 0.1;

    let confidence = 0.5; // Base confidence

    // Boost for multiple authorities
    if (retrievalResult.authorities_used.length >= 2) {
      confidence += 0.2;
    }

    // Boost for federal/CMS sources
    if (retrievalResult.authorities_used.includes('federal') || retrievalResult.authorities_used.includes('cms')) {
      confidence += 0.2;
    }

    // Boost for high-scoring sections
    const avgScore = retrievalResult.sections.reduce((sum, s) => sum + s.score, 0) / retrievalResult.sections.length;
    confidence += avgScore * 0.3;

    // Penalty for missing critical context
    if (entities.intent === 'cost_estimation' && !entities.cpt_codes && !entities.hcpcs_codes) {
      confidence -= 0.3;
    }

    if (entities.intent === 'network_check' && !entities.provider && !entities.npi) {
      confidence -= 0.3;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Enhance citations with additional metadata
   */
  private enhanceCitations(citations: any[], retrievalResult: RetrievalResult): Citation[] {
    return citations.map((citation, index) => {
      // Find matching section for additional context
      const matchingSection = retrievalResult.sections.find(s =>
        s.document.title.includes(citation.title) ||
        s.document.authority === citation.authority.toLowerCase()
      );

      return {
        authority: citation.authority,
        title: citation.title,
        section_or_policy_id: citation.section_or_policy_id,
        eff_date: citation.eff_date || matchingSection?.document.eff_date,
        url: matchingSection?.document.url,
        excerpt: citation.excerpt
      };
    });
  }

  /**
   * Map string confidence level to numeric
   */
  private mapConfidenceLevel(level: string): number {
    const mapping = {
      'high': 0.9,
      'medium': 0.7,
      'low': 0.5
    };
    return mapping[level as keyof typeof mapping] || 0.5;
  }

  /**
   * Generate fallback response when AI composition fails
   */
  private generateFallbackResponse(
    query: string,
    retrievalResult: RetrievalResult,
    entities: ExtractedEntities
  ): ChatResponse {
    const authorities = retrievalResult.authorities_used.join(', ');

    return {
      answer: `I found relevant information from ${authorities} sources, but need to research your specific question further. Let me help you find the right resources and next steps.`,
      citations: retrievalResult.sections.slice(0, 3).map(section => ({
        authority: section.document.authority,
        title: section.document.title,
        eff_date: section.document.eff_date,
        url: section.document.url
      })),
      nextSteps: [
        'Contact your insurance company for plan-specific guidance',
        'Check your plan documents or member portal',
        'Consider consulting with a patient advocate if needed'
      ],
      scripts: [],
      forms: [],
      confidence: 0.4,
      authorities_used: retrievalResult.authorities_used
    };
  }

  /**
   * Enhance answer with jargon explanations and actionable links
   */
  private enhanceAnswerWithJargonAndLinks(
    answer: string,
    explicitJargon: any[],
    intent: string
  ): {
    answer: string;
    jargonExplanations: JargonDefinition[];
    actionableLinks: ActionableLink[];
  } {
    const jargonExplanations: JargonDefinition[] = [];
    const actionableLinks: ActionableLink[] = [];

    // Add jargon explanations for terms found in the answer
    const answerLower = answer.toLowerCase();
    Object.values(this.insuranceJargon).forEach(jargon => {
      if (answerLower.includes(jargon.term.toLowerCase()) ||
          answerLower.includes(jargon.term.toLowerCase().replace(/[^a-z\s]/g, ''))) {
        jargonExplanations.push(jargon);
      }
    });

    // Add explicit jargon from AI response
    explicitJargon.forEach(item => {
      if (!jargonExplanations.find(j => j.term.toLowerCase() === item.term.toLowerCase())) {
        jargonExplanations.push({
          term: item.term,
          definition: item.definition,
          example: item.context
        });
      }
    });

    // Add relevant actionable links based on intent
    const intentLinks = this.actionableLinks[intent] || [];
    actionableLinks.push(...intentLinks);

    // Always add general help resources
    actionableLinks.push(...this.actionableLinks.general_help);

    // Add state resources link
    actionableLinks.push(...this.actionableLinks.state_resources);

    return {
      answer,
      jargonExplanations,
      actionableLinks
    };
  }

  /**
   * Generate downloadable artifacts (forms, letters, etc.)
   */
  async generateArtifacts(response: ChatResponse, entities: ExtractedEntities, context: ChatContext): Promise<Form[]> {
    const artifacts: Form[] = [];

    // Generate itemized bill request if relevant
    if (entities.intent === 'billing_question' || entities.intent === 'claim_question') {
      artifacts.push({
        name: 'Itemized Bill Request',
        description: 'Template letter to request detailed itemized bill from provider',
        required_info: ['Provider name and address', 'Date of service', 'Your contact information']
      });
    }

    // Generate appeal letter if relevant
    if (entities.intent === 'appeal_process') {
      artifacts.push({
        name: 'Insurance Appeal Letter',
        description: 'Template for formal appeal letter to insurance company',
        required_info: ['Claim number', 'Date of denial', 'Specific reasons for appeal', 'Supporting documentation']
      });
    }

    // Generate prior auth request if relevant
    if (entities.intent === 'prior_auth') {
      artifacts.push({
        name: 'Prior Authorization Request',
        description: 'Form to request prior authorization for medical services',
        required_info: ['Provider information', 'Procedure codes', 'Medical necessity documentation']
      });
    }

    return artifacts;
  }
}