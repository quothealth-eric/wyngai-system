/**
 * WyngAI Central Assistant - Query Understanding
 * Extract entities and intent from user queries for improved RAG retrieval
 */

import OpenAI from 'openai';
import { ExtractedEntities, ChatContext, InsurancePlanInputs } from '@/lib/types/rag';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export class QueryUnderstanding {
  /**
   * Extract entities and intent from user query
   */
  async extractEntities(query: string, context?: ChatContext): Promise<ExtractedEntities> {
    console.log('🧠 Extracting entities from query:', query.substring(0, 100));

    try {
      const systemPrompt = this.buildEntityExtractionPrompt(context);

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        functions: [{
          name: 'extract_entities',
          description: 'Extract structured entities from insurance query',
          parameters: {
            type: 'object',
            properties: {
              planType: {
                type: 'string',
                enum: ['HMO', 'PPO', 'EPO', 'HDHP', 'POS'],
                description: 'Type of health insurance plan'
              },
              state: {
                type: 'string',
                description: 'US state code (e.g., CA, NY, TX)'
              },
              provider: {
                type: 'string',
                description: 'Healthcare provider name or facility'
              },
              npi: {
                type: 'string',
                description: 'National Provider Identifier'
              },
              cpt_codes: {
                type: 'array',
                items: { type: 'string' },
                description: 'CPT procedure codes'
              },
              hcpcs_codes: {
                type: 'array',
                items: { type: 'string' },
                description: 'HCPCS codes'
              },
              date_of_service: {
                type: 'string',
                description: 'Date of service (YYYY-MM-DD format)'
              },
              network_status: {
                type: 'string',
                enum: ['in', 'out', 'unknown'],
                description: 'Provider network status'
              },
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description: 'Key insurance terms and concepts'
              },
              intent: {
                type: 'string',
                enum: [
                  'coverage_verification',
                  'cost_estimation',
                  'claim_question',
                  'appeal_process',
                  'network_check',
                  'prior_auth',
                  'enrollment',
                  'benefits_explanation',
                  'billing_question',
                  'pharmacy',
                  'emergency_coverage',
                  'out_of_state',
                  'general_question'
                ],
                description: 'Primary intent of the query'
              },
              urgency: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Urgency level based on query content'
              }
            },
            required: ['keywords', 'intent', 'urgency']
          }
        }],
        function_call: { name: 'extract_entities' },
        temperature: 0.1
      });

      const functionCall = response.choices[0].message.function_call;
      if (functionCall?.arguments) {
        const entities = JSON.parse(functionCall.arguments) as ExtractedEntities;

        // Merge with context if available
        if (context) {
          entities.planType = entities.planType || context.planInputs?.planType;
          entities.state = entities.state || context.planInputs?.state;
        }

        console.log('✅ Extracted entities:', {
          intent: entities.intent,
          planType: entities.planType,
          state: entities.state,
          keywords: entities.keywords?.slice(0, 3)
        });

        return entities;
      }
    } catch (error) {
      console.error('Error extracting entities:', error);
    }

    // Fallback to rule-based extraction
    return this.fallbackEntityExtraction(query, context);
  }

  /**
   * Determine if query requires clarification before answering
   */
  shouldClarify(entities: ExtractedEntities, context?: ChatContext): {
    needsClarification: boolean;
    clarificationQuestion?: string;
    missingInfo?: string[];
  } {
    const missingInfo: string[] = [];

    // Check for plan-specific questions without plan context
    if (this.isPlanSpecificIntent(entities.intent)) {
      if (!entities.planType && !context?.planInputs?.planType) {
        missingInfo.push('plan type (HMO, PPO, EPO, HDHP)');
      }
      if (!entities.state && !context?.planInputs?.state) {
        missingInfo.push('your state');
      }
    }

    // Check for cost estimation without sufficient detail
    if (entities.intent === 'cost_estimation') {
      if (!entities.cpt_codes && !entities.hcpcs_codes) {
        missingInfo.push('specific procedure codes or service details');
      }
    }

    // Check for network questions without provider info
    if (entities.intent === 'network_check') {
      if (!entities.provider && !entities.npi) {
        missingInfo.push('provider name or NPI number');
      }
    }

    // Check for appeal questions without claim details
    if (entities.intent === 'appeal_process') {
      if (!entities.date_of_service) {
        missingInfo.push('date of service');
      }
    }

    if (missingInfo.length > 0) {
      return {
        needsClarification: true,
        clarificationQuestion: this.buildClarificationQuestion(entities.intent, missingInfo),
        missingInfo
      };
    }

    return { needsClarification: false };
  }

  /**
   * Build system prompt for entity extraction
   */
  private buildEntityExtractionPrompt(context?: ChatContext): string {
    let prompt = `You are an expert at extracting structured information from health insurance queries.

Extract relevant entities from the user's question, focusing on:
- Plan type and coverage details
- Geographic location (state)
- Healthcare providers and services
- Medical codes (CPT, HCPCS)
- Dates and timeframes
- Insurance-specific keywords and concepts
- The primary intent/purpose of the question
- Urgency level

Be precise and only extract information that is explicitly mentioned or clearly implied.`;

    if (context?.planInputs) {
      prompt += `\n\nExisting context:
- Plan Type: ${context.planInputs.planType || 'Unknown'}
- State: ${context.planInputs.state || 'Unknown'}
- Plan Name: ${context.planInputs.planName || 'Unknown'}`;
    }

    if (context?.collectedFacts) {
      prompt += `\n\nPreviously collected facts: ${JSON.stringify(context.collectedFacts)}`;
    }

    return prompt;
  }

  /**
   * Determine if intent requires plan-specific information
   */
  private isPlanSpecificIntent(intent?: string): boolean {
    const planSpecificIntents = [
      'coverage_verification',
      'cost_estimation',
      'network_check',
      'prior_auth',
      'benefits_explanation',
      'pharmacy'
    ];
    return planSpecificIntents.includes(intent || '');
  }

  /**
   * Build clarification question based on missing information
   */
  private buildClarificationQuestion(intent?: string, missingInfo?: string[]): string {
    if (!missingInfo || missingInfo.length === 0) return '';

    const missing = missingInfo.join(' and ');

    const templates = {
      'coverage_verification': `To check your coverage accurately, I need to know your ${missing}. What type of plan do you have?`,
      'cost_estimation': `To estimate your costs, I need more details about ${missing}. Can you provide the specific procedure or service?`,
      'network_check': `To verify if a provider is in your network, I need ${missing}. Can you share the provider's name or NPI number?`,
      'appeal_process': `To help with your appeal, I need ${missing}. When did the service occur?`,
      'prior_auth': `To guide you through prior authorization, I need to know ${missing}. What's your plan type?`,
      'benefits_explanation': `To explain your benefits accurately, I need ${missing}. What type of insurance plan do you have?`,
      'pharmacy': `To help with pharmacy questions, I need ${missing}. What's your plan type and state?`
    };

    return templates[intent as keyof typeof templates] ||
           `To help you better, I need some additional information: ${missing}. Can you provide these details?`;
  }

  /**
   * Fallback entity extraction using rule-based patterns
   */
  private fallbackEntityExtraction(query: string, context?: ChatContext): ExtractedEntities {
    console.log('🔧 Using fallback entity extraction');

    const queryLower = query.toLowerCase();
    const entities: ExtractedEntities = {
      keywords: [],
      intent: 'general_question',
      urgency: 'medium'
    };

    // Extract plan type
    const planTypes = ['HMO', 'PPO', 'EPO', 'HDHP', 'POS'];
    for (const planType of planTypes) {
      if (queryLower.includes(planType.toLowerCase())) {
        entities.planType = planType;
        break;
      }
    }

    // Extract state codes (common patterns)
    const statePattern = /\b([A-Z]{2})\b/g;
    const stateMatches = query.match(statePattern);
    if (stateMatches) {
      entities.state = stateMatches[0];
    }

    // Extract CPT codes
    const cptPattern = /\b(\d{5})\b/g;
    const cptMatches = query.match(cptPattern);
    if (cptMatches) {
      entities.cpt_codes = cptMatches;
    }

    // Extract keywords
    const insuranceTerms = [
      'deductible', 'coinsurance', 'copay', 'prior authorization', 'referral',
      'network', 'emergency', 'appeal', 'claim', 'EOB', 'denial', 'coverage',
      'enrollment', 'COBRA', 'marketplace', 'formulary', 'pharmacy'
    ];

    entities.keywords = insuranceTerms.filter(term =>
      queryLower.includes(term.toLowerCase())
    );

    // Determine intent from keywords
    if (queryLower.includes('cost') || queryLower.includes('pay') || queryLower.includes('owe')) {
      entities.intent = 'cost_estimation';
    } else if (queryLower.includes('cover') || queryLower.includes('benefit')) {
      entities.intent = 'coverage_verification';
    } else if (queryLower.includes('network') || queryLower.includes('provider')) {
      entities.intent = 'network_check';
    } else if (queryLower.includes('appeal') || queryLower.includes('deny')) {
      entities.intent = 'appeal_process';
    } else if (queryLower.includes('prior auth') || queryLower.includes('authorization')) {
      entities.intent = 'prior_auth';
    } else if (queryLower.includes('claim') || queryLower.includes('eob')) {
      entities.intent = 'claim_question';
    }

    // Determine urgency
    const urgentTerms = ['emergency', 'urgent', 'asap', 'immediately', 'deadline'];
    if (urgentTerms.some(term => queryLower.includes(term))) {
      entities.urgency = 'high';
    }

    // Merge with context
    if (context?.planInputs) {
      entities.planType = entities.planType || context.planInputs.planType;
      entities.state = entities.state || context.planInputs.state;
    }

    return entities;
  }

  /**
   * Normalize and validate extracted entities
   */
  normalizeEntities(entities: ExtractedEntities): ExtractedEntities {
    return {
      ...entities,
      state: entities.state?.toUpperCase(),
      planType: entities.planType?.toUpperCase() as 'HMO' | 'PPO' | 'EPO' | 'HDHP' | 'POS' | undefined,
      cpt_codes: entities.cpt_codes?.map(code => code.replace(/\D/g, '')),
      hcpcs_codes: entities.hcpcs_codes?.map(code => code.toUpperCase()),
      keywords: entities.keywords?.map(keyword => keyword.toLowerCase()),
      npi: entities.npi?.replace(/\D/g, ''),
    };
  }

  /**
   * Update context with new information from entities
   */
  updateContext(context: ChatContext, entities: ExtractedEntities): ChatContext {
    const updatedContext = { ...context };

    // Update plan inputs
    if (!updatedContext.planInputs) {
      updatedContext.planInputs = {};
    }

    if (entities.planType && !updatedContext.planInputs.planType) {
      updatedContext.planInputs.planType = entities.planType as 'HMO' | 'PPO' | 'EPO' | 'HDHP' | 'POS';
    }

    if (entities.state && !updatedContext.planInputs.state) {
      updatedContext.planInputs.state = entities.state;
      updatedContext.userState = entities.state;
    }

    // Update collected facts
    if (!updatedContext.collectedFacts) {
      updatedContext.collectedFacts = {};
    }

    if (entities.provider) {
      updatedContext.collectedFacts.provider = entities.provider;
    }

    if (entities.date_of_service) {
      updatedContext.collectedFacts.date_of_service = entities.date_of_service;
    }

    if (entities.network_status) {
      updatedContext.collectedFacts.network_status = entities.network_status;
    }

    return updatedContext;
  }
}