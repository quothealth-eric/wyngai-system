/**
 * Intent Router for WyngAI Search Platform
 *
 * This module classifies user queries and determines the appropriate
 * search mode (insurance, legislation, or mixed) based on intent analysis.
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

export type Intent = 'insurance' | 'legislation' | 'mixed' | 'file_analysis';

export interface IntentResult {
  intent: 'insurance' | 'legislation' | 'mixed' | 'file_analysis';
  confidence: number;
  themes: Array<{ theme: string; score: number }>;
  requires_clarification: boolean;
  suggested_mode: 'insurance' | 'legislation' | 'mixed';
  reasoning: string;
}

export interface QueryContext {
  query: string;
  files?: Array<{ name: string; type: string; size?: number }>;
  user_state?: string;
  conversation_history?: string[];
  user_context?: Record<string, any>;
}

export class IntentRouter {
  private billPatterns = [
    /\b(H\.R\.|S\.|bill|act|legislation|congress|senate|house)\b/i,
    /\b\d{3}(th|st|nd|rd)\s+congress\b/i,
    /\b(proposed|pending|enacted|passed)\s+(law|bill|legislation)\b/i,
    /\b(amend|modify|change)\s+(section|title|part)\s+\d+/i,
    /\b(medicare|medicaid|affordable care)\s+(act|bill|law)\b/i
  ];

  private insurancePatterns = [
    /\b(my\s+)?(insurance|coverage|plan|benefits?)\b/i,
    /\b(deductible|premium|copay|coinsurance|out[- ]?of[- ]?pocket)\b/i,
    /\b(in[- ]?network|out[- ]?of[- ]?network|provider|doctor)\b/i,
    /\b(claim|appeal|denial|prior[- ]?authorization)\b/i,
    /\b(marketplace|healthcare\.gov|enroll|sign[- ]?up)\b/i,
    /\b(medicare|medicaid|chip)\s+(eligibility|coverage|benefits?)\b/i,
    /\b(employer|job)\s+(insurance|benefits?|coverage)\b/i
  ];

  private fileAnalysisIndicators = [
    /\b(analyze|explain|review|understand)\s+(this|my|the)\s+(bill|document|form|statement)\b/i,
    /\b(what\s+(does|is))\s+(this|my)\s+(bill|eob|statement)\b/i,
    /\b(how\s+much\s+(do\s+)?i\s+(owe|pay))\b/i,
    /\b(billing\s+error|mistake|wrong|incorrect)\b/i
  ];

  async classifyIntent(context: QueryContext): Promise<IntentResult> {
    const { query, files = [] } = context;

    try {
      // Quick pattern-based classification first
      const quickClassification = this.quickClassify(query, files);

      if (quickClassification.confidence > 0.8) {
        return quickClassification;
      }

      // Use LLM for more nuanced classification
      const llmClassification = await this.llmClassify(context);

      // Combine results, favoring LLM if confidence is reasonable
      if (llmClassification.confidence > 0.6) {
        return llmClassification;
      }

      return quickClassification;

    } catch (error) {
      console.error('Intent classification failed:', error);
      // Fallback to pattern-based classification
      return this.quickClassify(query, files);
    }
  }

  private quickClassify(query: string, files: Array<{ name: string; type: string }>): IntentResult {
    const queryLower = query.toLowerCase();

    // Check for file analysis intent
    if (files.length > 0 || this.fileAnalysisIndicators.some(pattern => pattern.test(query))) {
      return {
        intent: 'file_analysis',
        confidence: 0.9,
        themes: [{ theme: 'file_analysis', score: 1.0 }],
        requires_clarification: false,
        suggested_mode: 'insurance',
        reasoning: 'File uploaded or file analysis language detected'
      };
    }

    // Check for legislation intent
    const billMatches = this.billPatterns.filter(pattern => pattern.test(query)).length;
    const insuranceMatches = this.insurancePatterns.filter(pattern => pattern.test(query)).length;

    if (billMatches > 0 && insuranceMatches === 0) {
      return {
        intent: 'legislation',
        confidence: 0.85,
        themes: [{ theme: 'legislation', score: 1.0 }],
        requires_clarification: false,
        suggested_mode: 'legislation',
        reasoning: 'Legislative language detected without insurance context'
      };
    }

    if (insuranceMatches > 0 && billMatches === 0) {
      return {
        intent: 'insurance',
        confidence: 0.8,
        themes: [{ theme: 'insurance', score: 1.0 }],
        requires_clarification: false,
        suggested_mode: 'insurance',
        reasoning: 'Insurance language detected without legislative context'
      };
    }

    if (billMatches > 0 && insuranceMatches > 0) {
      return {
        intent: 'mixed',
        confidence: 0.75,
        themes: [
          { theme: 'legislation', score: 0.6 },
          { theme: 'insurance', score: 0.6 }
        ],
        requires_clarification: false,
        suggested_mode: 'mixed',
        reasoning: 'Both legislative and insurance language detected'
      };
    }

    // Default to insurance with low confidence
    return {
      intent: 'insurance',
      confidence: 0.4,
      themes: [{ theme: 'general', score: 0.5 }],
      requires_clarification: true,
      suggested_mode: 'insurance',
      reasoning: 'No clear patterns detected, defaulting to insurance'
    };
  }

  private async llmClassify(context: QueryContext): Promise<IntentResult> {
    const { query, files = [], conversation_history = [] } = context;

    const prompt = `
Classify this healthcare query into one of these categories:

1. "insurance" - Questions about health insurance coverage, benefits, costs, providers, claims, appeals
2. "legislation" - Questions about healthcare bills, laws, Congress, policy proposals
3. "mixed" - Questions that involve both insurance and legislation
4. "file_analysis" - Requests to analyze uploaded medical bills, EOBs, or documents

Query: "${query}"
${files.length > 0 ? `Files uploaded: ${files.map(f => f.name).join(', ')}` : ''}
${conversation_history.length > 0 ? `Previous context: ${conversation_history.slice(-2).join(' ')}` : ''}

Respond in this exact JSON format:
{
  "intent": "insurance|legislation|mixed|file_analysis",
  "confidence": 0.0-1.0,
  "themes": [{"theme": "string", "score": 0.0-1.0}],
  "requires_clarification": true|false,
  "suggested_mode": "insurance|legislation|mixed",
  "reasoning": "Brief explanation of classification"
}

Examples:
- "What does H.R. 1234 say about Medicare?" → legislation
- "Is my prescription covered?" → insurance
- "How would the new healthcare bill affect my premiums?" → mixed
- "Analyze this medical bill" → file_analysis
`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at classifying healthcare queries. Respond only with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 300
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from LLM');
      }

      const result = JSON.parse(content);

      // Validate the result
      if (!['insurance', 'legislation', 'mixed', 'file_analysis'].includes(result.intent)) {
        throw new Error('Invalid intent classification');
      }

      return result;

    } catch (error) {
      console.error('LLM classification failed:', error);
      throw error;
    }
  }

  extractBillReferences(query: string): string[] {
    const billRefs: string[] = [];

    // H.R. and S. patterns
    const hrPattern = /H\.R\.\s*(\d+)/gi;
    const senatePattern = /S\.\s*(\d+)/gi;

    let match;
    while ((match = hrPattern.exec(query)) !== null) {
      billRefs.push(`H.R. ${match[1]}`);
    }

    while ((match = senatePattern.exec(query)) !== null) {
      billRefs.push(`S. ${match[1]}`);
    }

    return billRefs;
  }

  extractStateReferences(query: string): string | null {
    const statePattern = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b/i;

    const match = query.match(statePattern);
    if (match) {
      const state = match[1].toLowerCase();

      // Convert full state names to abbreviations
      const stateMap: Record<string, string> = {
        'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
        'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
        'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
        'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
        'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
        'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
        'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
        'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
        'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
        'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
        'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
        'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
        'wisconsin': 'WI', 'wyoming': 'WY'
      };

      return stateMap[state] || state.toUpperCase();
    }

    return null;
  }

  shouldSwitchToLegislationMode(query: string): boolean {
    const legislationIndicators = [
      /\b(H\.R\.|S\.)\s*\d+/i,
      /\b(bill|act|law)\s+(number|#)?\s*\d+/i,
      /\b(congress|senate|house)\s+(bill|legislation)/i,
      /\b(proposed|pending|enacted|passed)\s+(healthcare|medical)\s+(bill|law|act)/i,
      /\b(what\s+(does|would|will))\s+.*(bill|act|law)/i
    ];

    return legislationIndicators.some(pattern => pattern.test(query));
  }

  shouldSwitchToInsuranceMode(query: string): boolean {
    const personalInsuranceIndicators = [
      /\b(my|our|i|we)\s+(insurance|coverage|plan|benefits?)/i,
      /\b(am\s+i|are\s+we)\s+(covered|eligible)/i,
      /\b(how\s+much\s+(will|would|do))\s+(i|we)\s+(pay|owe)/i,
      /\b(my\s+)?(premium|deductible|copay|coinsurance)/i,
      /\b(in[- ]?network|out[- ]?of[- ]?network)\s+(for\s+me|provider)/i
    ];

    return personalInsuranceIndicators.some(pattern => pattern.test(query));
  }
}