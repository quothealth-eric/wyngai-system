/**
 * Unified Intent Router for Wyng
 * Determines whether user input should go to Chat or Analyzer mode
 */

export interface IntentInput {
  text?: string;
  files?: File[];
  hints?: {
    userClickedUpload?: boolean;
    userClickedChat?: boolean;
  };
}

export interface IntentResult {
  mode: 'CHAT' | 'ANALYZER';
  confidence: number;
  reason: string;
  needsClarification?: boolean;
  clarificationOptions?: Array<{
    label: string;
    value: 'CHAT' | 'ANALYZER';
    description: string;
  }>;
}

export class IntentRouter {
  // Bill/EOB/Analyzer keywords
  private readonly analyzerKeywords = [
    'bill', 'eob', 'explanation of benefits', 'charge', 'charged', 'overcharged',
    'cpt', 'hcpcs', 'icd', 'venipuncture', 'j7120', 'itemized', 'billing',
    'statement', 'invoice', 'receipt', 'procedure code', 'diagnosis code',
    'claim number', 'date of service', 'dos', 'provider charges', 'allowed amount',
    'plan paid', 'patient responsibility', 'balance due', 'copay', 'coinsurance applied',
    'deductible applied', 'appeal this bill', 'dispute charge', 'medical bill',
    'hospital bill', 'doctor bill', 'lab bill', 'was i overcharged',
    'why was i charged', 'billing error', 'incorrect charge', 'review my bill'
  ];

  // General insurance/chat keywords
  private readonly chatKeywords = [
    'plan', 'ppo', 'hmo', 'epo', 'hdhp', 'pos', 'deductible', 'coinsurance',
    'oop max', 'out of pocket maximum', 'prior auth', 'prior authorization',
    'referral', 'out-of-state', 'out of state', 'cobra', 'marketplace',
    'medicaid', 'medicare', 'formulary', 'tier', 'nsa', 'no surprises act',
    'external review', 'appeal process', 'coverage', 'benefits', 'network',
    'in-network', 'out-of-network', 'premium', 'enrollment', 'open enrollment',
    'special enrollment', 'qualifying event', 'dependent coverage',
    'pre-existing condition', 'essential health benefits', 'preventive care',
    'wellness', 'annual physical', 'screening', 'vaccination', 'immunization',
    'mental health', 'behavioral health', 'substance abuse', 'maternity',
    'prescription drug', 'pharmacy', 'generic', 'brand name', 'step therapy',
    'quantity limits', 'mail order pharmacy', 'specialty pharmacy'
  ];

  // File types that indicate analyzer mode
  private readonly analyzerFileTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/tiff',
    'image/tif',
    'image/heic',
    'image/heif'
  ];

  /**
   * Classify user intent based on input
   */
  classify(input: IntentInput): IntentResult {
    console.log('🎯 Classifying intent:', {
      hasText: !!input.text,
      hasFiles: !!input.files?.length,
      hints: input.hints
    });

    // Strong file-based indicators (highest priority)
    if (input.files && input.files.length > 0) {
      const hasAnalyzerFiles = input.files.some(file =>
        this.analyzerFileTypes.includes(file.type) ||
        this.hasAnalyzerFileExtension(file.name)
      );

      if (hasAnalyzerFiles) {
        return {
          mode: 'ANALYZER',
          confidence: 0.95,
          reason: 'Document files detected (PDF/image) - likely bill/EOB analysis'
        };
      }
    }

    // User hint-based routing
    if (input.hints?.userClickedUpload) {
      return {
        mode: 'ANALYZER',
        confidence: 0.9,
        reason: 'User explicitly clicked upload bill/EOB action'
      };
    }

    if (input.hints?.userClickedChat) {
      return {
        mode: 'CHAT',
        confidence: 0.9,
        reason: 'User explicitly clicked ask question action'
      };
    }

    // Text-based classification
    if (input.text && input.text.trim().length > 0) {
      const text = input.text.toLowerCase();

      // Check for analyzer keywords
      const analyzerMatches = this.analyzerKeywords.filter(keyword =>
        text.includes(keyword)
      );

      // Check for chat keywords
      const chatMatches = this.chatKeywords.filter(keyword =>
        text.includes(keyword)
      );

      // Strong analyzer indicators
      if (analyzerMatches.length > 0) {
        const confidence = Math.min(0.85, 0.6 + (analyzerMatches.length * 0.1));
        return {
          mode: 'ANALYZER',
          confidence,
          reason: `Bill/EOB keywords detected: ${analyzerMatches.slice(0, 3).join(', ')}`
        };
      }

      // Strong chat indicators
      if (chatMatches.length > 0) {
        const confidence = Math.min(0.85, 0.6 + (chatMatches.length * 0.1));
        return {
          mode: 'CHAT',
          confidence,
          reason: `Insurance topic keywords detected: ${chatMatches.slice(0, 3).join(', ')}`
        };
      }

      // Pattern-based detection
      const analyzerPatterns = [
        /\b(cpt|hcpcs|icd-?\d+)\s*\d+/i, // Medical codes
        /\$\d+.*charge/i, // Dollar amounts with charge
        /was\s+i\s+(charged|billed|overcharged)/i, // Overcharge questions
        /why\s+(did|was)\s+i/i, // Why did I... questions about billing
        /review\s+(my|this)\s+(bill|eob|statement)/i // Review requests
      ];

      const chatPatterns = [
        /\b(cover|coverage|covered)\b/i, // Coverage questions
        /\b(plan|insurance)\s+(cover|pay|include)/i, // Plan coverage
        /\b(appeal|deny|denial|denied)\b/i, // Appeals
        /\b(network|in-network|out-of-network)\b/i, // Network questions
        /\b(state|states)\b/i // Multi-state questions
      ];

      // Check patterns
      const hasAnalyzerPattern = analyzerPatterns.some(pattern => pattern.test(text));
      const hasChatPattern = chatPatterns.some(pattern => pattern.test(text));

      if (hasAnalyzerPattern && !hasChatPattern) {
        return {
          mode: 'ANALYZER',
          confidence: 0.75,
          reason: 'Text pattern suggests bill/EOB analysis question'
        };
      }

      if (hasChatPattern && !hasAnalyzerPattern) {
        return {
          mode: 'CHAT',
          confidence: 0.75,
          reason: 'Text pattern suggests general insurance question'
        };
      }

      // Ambiguous - needs clarification
      if (text.length > 10) {
        return {
          mode: 'CHAT', // Default to chat for ambiguous cases
          confidence: 0.5,
          reason: 'Ambiguous input - defaulting to chat',
          needsClarification: true,
          clarificationOptions: [
            {
              label: 'Analyze my bill',
              value: 'ANALYZER',
              description: 'Upload and analyze a medical bill or EOB'
            },
            {
              label: 'Ask a question',
              value: 'CHAT',
              description: 'Get help with insurance topics and coverage'
            }
          ]
        };
      }
    }

    // Default case - no clear indicators
    return {
      mode: 'CHAT',
      confidence: 0.6,
      reason: 'No clear indicators - defaulting to general chat',
      needsClarification: true,
      clarificationOptions: [
        {
          label: 'Analyze my bill',
          value: 'ANALYZER',
          description: 'Upload and analyze a medical bill or EOB'
        },
        {
          label: 'Ask a question',
          value: 'CHAT',
          description: 'Get help with insurance topics and coverage'
        }
      ]
    };
  }

  /**
   * Check if filename has analyzer-compatible extension
   */
  private hasAnalyzerFileExtension(filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'tif', 'heic', 'heif'].includes(ext || '');
  }

  /**
   * Get example queries for each mode
   */
  getExamples() {
    return {
      chat: [
        "Does my PPO cover me out-of-state?",
        "How do I appeal a denial?",
        "What's the difference between HMO and PPO?",
        "Do I need a referral for specialists?"
      ],
      analyzer: [
        "Was I overcharged for 36415 venipuncture?",
        "Review my hospital bill",
        "Is this EOB correct?",
        "Upload my medical bill"
      ]
    };
  }
}

// Export singleton instance
export const intentRouter = new IntentRouter();