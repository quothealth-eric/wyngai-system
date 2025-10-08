import { ThemeBank, AnswerCard, SemanticMatch, ChatAnswer } from '@/types/analyzer';
import fs from 'fs/promises';
import path from 'path';

export interface SearchResult {
  matches: SemanticMatch[];
  bestMatch: AnswerCard | null;
  confidence: number;
}

export class SemanticSearchEngine {
  private themeBank: ThemeBank | null = null;
  private answerCards: AnswerCard[] = [];
  private vocabulary: string[] = [];
  private idfScores: Map<string, number> = new Map();

  constructor() {
    this.initializeVocabulary();
  }

  public async initialize(): Promise<void> {
    await this.loadThemeBank();
    await this.loadAnswerCards();
    this.buildVocabulary();
    this.calculateIDF();
    console.log('🔍 Semantic search engine initialized');
  }

  public searchQuestions(query: string, topK: number = 3): SearchResult {
    if (!this.themeBank || this.answerCards.length === 0) {
      throw new Error('Search engine not initialized. Call initialize() first.');
    }

    console.log(`🔍 Searching for: "${query}"`);

    // Create embedding for the query
    const queryEmbedding = this.createEmbedding(query);

    // Calculate similarities for all questions
    const similarities: SemanticMatch[] = [];

    for (const card of this.answerCards) {
      // Combine question and answer for better matching
      const cardText = `${card.question} ${card.answer}`;
      const cardEmbedding = this.createEmbedding(cardText);

      const similarity = this.cosineSimilarity(queryEmbedding, cardEmbedding);

      similarities.push({
        questionId: card.questionId,
        question: card.question,
        similarity,
        themeId: card.themeId
      });
    }

    // Sort by similarity and take top K
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topMatches = similarities.slice(0, topK);

    // Find the best answer card
    const bestMatch = topMatches.length > 0
      ? this.answerCards.find(card => card.questionId === topMatches[0].questionId) || null
      : null;

    const confidence = topMatches.length > 0 ? topMatches[0].similarity : 0;

    console.log(`📊 Found ${topMatches.length} matches, best similarity: ${(confidence * 100).toFixed(1)}%`);

    return {
      matches: topMatches,
      bestMatch,
      confidence
    };
  }

  public generateChatAnswer(
    query: string,
    searchResult: SearchResult,
    ocrContext?: string,
    userNarrative?: string
  ): ChatAnswer {
    if (!searchResult.bestMatch) {
      return this.generateFallbackAnswer(query, ocrContext, userNarrative);
    }

    const card = searchResult.bestMatch;

    // Enhance answer with context
    let enhancedAnswer = card.answer;

    // Add OCR context if relevant
    if (ocrContext && this.isOCRRelevantToQuestion(card.question, ocrContext)) {
      enhancedAnswer += `\n\nBased on your uploaded documents: ${this.extractRelevantOCRInsights(ocrContext, card.question)}`;
    }

    // Add user narrative context
    if (userNarrative && userNarrative.length > 10) {
      enhancedAnswer += `\n\nConsidering your specific situation: ${this.contextualizeForNarrative(card.answer, userNarrative)}`;
    }

    return {
      answer: enhancedAnswer,
      checklist: card.checklist,
      phoneScripts: card.phoneScript ? [card.phoneScript] : [],
      appealSnippet: card.appealSnippet,
      sources: card.sources,
      confidence: searchResult.confidence,
      matchedQuestions: searchResult.matches.map(match => ({
        question: match.question,
        similarity: match.similarity
      }))
    };
  }

  private async loadThemeBank(): Promise<void> {
    try {
      const themeBankPath = path.join(process.cwd(), 'knowledge', 'theme_bank.json');
      const themeBankData = await fs.readFile(themeBankPath, 'utf-8');
      this.themeBank = JSON.parse(themeBankData);
      console.log(`📚 Loaded theme bank with ${this.themeBank?.themes.length || 0} themes`);
    } catch (error) {
      console.error('Failed to load theme bank:', error);
      throw new Error('Could not load theme bank');
    }
  }

  private async loadAnswerCards(): Promise<void> {
    try {
      const cardsPath = path.join(process.cwd(), 'knowledge', 'cards', 'cards.jsonl');
      const cardsData = await fs.readFile(cardsPath, 'utf-8');

      // Parse JSONL format
      const lines = cardsData.trim().split('\n');
      this.answerCards = lines
        .filter(line => line.trim())
        .map(line => JSON.parse(line) as AnswerCard);

      console.log(`📋 Loaded ${this.answerCards.length} answer cards`);
    } catch (error) {
      console.error('Failed to load answer cards:', error);
      // Continue with empty answer cards - system will still work with fallback
      this.answerCards = [];
    }
  }

  private initializeVocabulary(): void {
    // Healthcare and insurance specific vocabulary
    this.vocabulary = [
      // Basic terms
      'insurance', 'health', 'coverage', 'plan', 'policy', 'claim', 'bill', 'cost', 'fee', 'charge',
      'deductible', 'copay', 'coinsurance', 'premium', 'network', 'provider', 'doctor', 'hospital',

      // Plan types
      'hmo', 'ppo', 'epo', 'pos', 'hdhp', 'medicare', 'medicaid',

      // Actions
      'enroll', 'appeal', 'dispute', 'file', 'submit', 'authorize', 'approve', 'deny', 'cover',

      // Services
      'emergency', 'preventive', 'screening', 'surgery', 'therapy', 'prescription', 'drug',
      'mental', 'maternity', 'telehealth', 'urgent', 'primary', 'specialist',

      // Financial
      'allowed', 'billed', 'paid', 'owe', 'balance', 'responsibility', 'maximum', 'limit',

      // Administrative
      'authorization', 'referral', 'formulary', 'explanation', 'benefits', 'eob', 'coordination',

      // Legal/Regulatory
      'surprise', 'billing', 'cobra', 'hipaa', 'aca', 'obamacare', 'medicare', 'medicaid'
    ];
  }

  private buildVocabulary(): void {
    // Extend vocabulary with terms from answer cards
    const cardTerms = new Set<string>();

    for (const card of this.answerCards) {
      const text = `${card.question} ${card.answer}`.toLowerCase();
      const words = this.tokenize(text);
      for (const word of words) {
        cardTerms.add(word);
      }
    }

    // Add theme bank terms
    if (this.themeBank) {
      for (const theme of this.themeBank.themes) {
        const themeText = `${theme.themeName} ${theme.description} ${theme.questions.join(' ')}`.toLowerCase();
        const words = this.tokenize(themeText);
        for (const word of words) {
          cardTerms.add(word);
        }
      }
    }

    // Merge with base vocabulary
    this.vocabulary = Array.from(new Set([...this.vocabulary, ...Array.from(cardTerms)]));
    console.log(`📝 Built vocabulary with ${this.vocabulary.length} terms`);
  }

  private calculateIDF(): void {
    const docCount = this.answerCards.length;
    if (docCount === 0) return;

    // Calculate document frequency for each term
    const termDocCount = new Map<string, number>();

    for (const card of this.answerCards) {
      const text = `${card.question} ${card.answer}`.toLowerCase();
      const words = new Set(this.tokenize(text));

      for (const word of Array.from(words)) {
        termDocCount.set(word, (termDocCount.get(word) || 0) + 1);
      }
    }

    // Calculate IDF scores
    for (const [term, count] of Array.from(termDocCount.entries())) {
      const idf = Math.log(docCount / count);
      this.idfScores.set(term, idf);
    }

    console.log(`📊 Calculated IDF scores for ${this.idfScores.size} terms`);
  }

  private createEmbedding(text: string): number[] {
    const tokens = this.tokenize(text.toLowerCase());
    const termFreq = new Map<string, number>();

    // Calculate term frequency
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    // Create TF-IDF vector
    const embedding = new Array(this.vocabulary.length).fill(0);

    for (let i = 0; i < this.vocabulary.length; i++) {
      const term = this.vocabulary[i];
      const tf = termFreq.get(term) || 0;
      const idf = this.idfScores.get(term) || 0;

      if (tf > 0) {
        // TF-IDF with normalization
        embedding[i] = (1 + Math.log(tf)) * idf;
      }
    }

    // L2 normalization
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2)
      .filter(token => !this.isStopWord(token));
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one',
      'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old',
      'see', 'two', 'way', 'who', 'boy', 'did', 'she', 'use', 'her', 'oil', 'sit', 'set', 'run'
    ]);
    return stopWords.has(word);
  }

  private isOCRRelevantToQuestion(question: string, ocrContext: string): boolean {
    const questionTokens = new Set(this.tokenize(question));
    const ocrTokens = new Set(this.tokenize(ocrContext));

    // Check for overlap in key terms
    const overlap = Array.from(questionTokens).filter(token => ocrTokens.has(token));
    return overlap.length > 2; // Arbitrary threshold
  }

  private extractRelevantOCRInsights(ocrContext: string, question: string): string {
    const context = ocrContext.substring(0, 200); // Limit context length
    const questionLower = question.toLowerCase();

    // Extract relevant sections based on question type
    if (questionLower.includes('deductible')) {
      const deductibleMatch = ocrContext.match(/deductible[:\s]*\$?([0-9,]+\.?\d{0,2})/i);
      return deductibleMatch ? `Your documents show a deductible of $${deductibleMatch[1]}.` : context;
    }

    if (questionLower.includes('copay')) {
      const copayMatch = ocrContext.match(/copay[:\s]*\$?([0-9,]+\.?\d{0,2})/i);
      return copayMatch ? `Your documents show a copay of $${copayMatch[1]}.` : context;
    }

    if (questionLower.includes('bill') || questionLower.includes('charge')) {
      const amountMatch = ocrContext.match(/(?:total|amount|charge)[:\s]*\$?([0-9,]+\.?\d{0,2})/i);
      return amountMatch ? `Your documents show charges of $${amountMatch[1]}.` : context;
    }

    return context;
  }

  private contextualizeForNarrative(answer: string, narrative: string): string {
    const narrativeLower = narrative.toLowerCase();

    if (narrativeLower.includes('emergency') || narrativeLower.includes('er')) {
      return 'Since this involves emergency care, you have additional protections under the No Surprises Act.';
    }

    if (narrativeLower.includes('surgery')) {
      return 'For surgical procedures, be aware that you may receive separate bills from the surgeon, anesthesiologist, and facility.';
    }

    if (narrativeLower.includes('out of network') || narrativeLower.includes('oon')) {
      return 'Since this involves out-of-network care, your costs may be higher and different rules may apply.';
    }

    if (narrativeLower.includes('denied') || narrativeLower.includes('rejection')) {
      return 'For denied claims, you have appeal rights and should act quickly to preserve your options.';
    }

    return 'Based on your situation, the standard guidance above applies.';
  }

  private generateFallbackAnswer(query: string, ocrContext?: string, userNarrative?: string): ChatAnswer {
    return {
      answer: `I understand you're asking about "${query}". While I don't have a specific answer card for this exact question, I can help you with general healthcare billing and insurance guidance. Consider contacting your insurance company directly, or if this involves billing errors, reach out to the provider's billing department for clarification.`,
      checklist: [
        'Contact your insurance company for specific plan details',
        'Gather all relevant documents before calling',
        'Ask for written confirmation of any information provided',
        'Keep detailed notes of all conversations',
        'Follow up on any promised actions or callbacks'
      ],
      phoneScripts: [
        'Hi, I have a question about my coverage and benefits. Can you help me understand [specific question]? I have my member ID ready.'
      ],
      sources: [
        {
          title: 'General Insurance Consumer Rights',
          authority: 'StateDOI',
          citation: 'state-consumer-rights-guide'
        }
      ],
      confidence: 0.5,
      matchedQuestions: []
    };
  }
}