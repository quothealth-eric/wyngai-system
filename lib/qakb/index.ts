import fs from 'fs';
import path from 'path';
import { AnswerCard, QAKBCache, QAKBQuery, QAKBResult, ThemeClassification } from '@/types/qakb';

class QAKBRetriever {
  private cache: QAKBCache;
  private initialized = false;

  constructor() {
    this.cache = {
      cards: new Map(),
      lastUpdated: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadAnswerCards();
      this.initialized = true;
      console.log(`QAKB initialized with ${this.cache.cards.size} answer cards`);
    } catch (error) {
      console.error('Failed to initialize QAKB:', error);
      throw error;
    }
  }

  private async loadAnswerCards(): Promise<void> {
    const cardsPath = path.join(process.cwd(), 'knowledge', 'cards', 'cards.jsonl');

    if (!fs.existsSync(cardsPath)) {
      throw new Error(`Answer cards file not found: ${cardsPath}`);
    }

    const cardsContent = fs.readFileSync(cardsPath, 'utf8');
    const lines = cardsContent.trim().split('\n');

    this.cache.cards.clear();

    for (const line of lines) {
      if (line.trim()) {
        try {
          const card = JSON.parse(line) as AnswerCard;
          this.cache.cards.set(card.cardId, card);
        } catch (error) {
          console.warn('Failed to parse answer card line:', line.substring(0, 100));
        }
      }
    }

    this.cache.lastUpdated = new Date().toISOString();
  }

  async retrieveAnswers(query: QAKBQuery): Promise<QAKBResult> {
    await this.initialize();

    // Step 1: Get theme-based candidates
    const candidateCards = this.getThemeCandidates(query.themes || []);

    // Step 2: Score candidates based on narrative similarity
    const scoredCandidates = this.scoreByNarrative(candidateCards, query.narrative);

    // Step 3: Apply context-based filtering and boosting
    const contextFiltered = this.applyContextFiltering(scoredCandidates, query.caseContext);

    // Step 4: Select primary and secondary cards
    const sortedCandidates = contextFiltered.sort((a, b) => b.score - a.score);

    if (sortedCandidates.length === 0) {
      throw new Error('No matching answer cards found for query');
    }

    const primaryCard = sortedCandidates[0].card;
    const secondaryCards = sortedCandidates
      .slice(1, 4) // Top 3 secondary cards
      .map(c => c.card);

    return {
      primaryCard,
      secondaryCards,
      confidence: sortedCandidates[0].score,
      matchReason: this.generateMatchReason(sortedCandidates[0], query)
    };
  }

  private getThemeCandidates(themes: string[]): AnswerCard[] {
    if (themes.length === 0) {
      // If no themes provided, return all cards
      return Array.from(this.cache.cards.values());
    }

    const candidates: AnswerCard[] = [];

    for (const card of this.cache.cards.values()) {
      // Exact theme match
      if (themes.some(theme => theme.toLowerCase() === card.theme.toLowerCase())) {
        candidates.push(card);
        continue;
      }

      // Partial theme match
      const cardThemeLower = card.theme.toLowerCase();
      const hasPartialMatch = themes.some(theme => {
        const themeLower = theme.toLowerCase();
        return cardThemeLower.includes(themeLower) || themeLower.includes(cardThemeLower);
      });

      if (hasPartialMatch) {
        candidates.push(card);
      }
    }

    return candidates;
  }

  private scoreByNarrative(cards: AnswerCard[], narrative: string): Array<{ card: AnswerCard; score: number }> {
    const narrativeLower = narrative.toLowerCase();
    const narrativeWords = narrativeLower.split(/\s+/).filter(word => word.length > 2);

    return cards.map(card => {
      let score = card.meta.confidence; // Base score from card confidence

      // Score based on question similarity
      const questionWords = card.question.toLowerCase().split(/\s+/);
      const questionMatches = narrativeWords.filter(word =>
        questionWords.some(qw => qw.includes(word) || word.includes(qw))
      );
      score += questionMatches.length * 0.1;

      // Score based on answer content relevance
      const answerWords = card.answer.toLowerCase().split(/\s+/);
      const answerMatches = narrativeWords.filter(word =>
        answerWords.some(aw => aw.includes(word) || word.includes(aw))
      );
      score += answerMatches.length * 0.05;

      // Boost for high-priority themes
      if (['Claims/Billing/EOB/Appeals', 'OON/Balance Billing', 'Costs'].includes(card.theme)) {
        score += 0.1;
      }

      return { card, score };
    });
  }

  private applyContextFiltering(
    scoredCards: Array<{ card: AnswerCard; score: number }>,
    context?: QAKBQuery['caseContext']
  ): Array<{ card: AnswerCard; score: number }> {
    if (!context) return scoredCards;

    return scoredCards.map(({ card, score }) => {
      let adjustedScore = score;

      // Boost claims/billing related cards if documents are present
      if (context.hasDocuments && card.theme.includes('Claims')) {
        adjustedScore += 0.15;
      }

      // Boost EOB-related cards if line items are present
      if (context.hasLineItems && card.question.toLowerCase().includes('eob')) {
        adjustedScore += 0.1;
      }

      // Boost emergency-related cards for emergency scenarios
      if (context.emergency && card.question.toLowerCase().includes('emergency')) {
        adjustedScore += 0.2;
      }

      // Boost No Surprises Act cards for NSA candidates
      if (context.nsaCandidate && card.theme === 'OON/Balance Billing') {
        adjustedScore += 0.25;
      }

      return { card, score: adjustedScore };
    });
  }

  private generateMatchReason(
    topMatch: { card: AnswerCard; score: number },
    query: QAKBQuery
  ): string {
    const reasons: string[] = [];

    if (query.themes?.includes(topMatch.card.theme)) {
      reasons.push(`theme match: ${topMatch.card.theme}`);
    }

    if (query.caseContext?.nsaCandidate && topMatch.card.theme === 'OON/Balance Billing') {
      reasons.push('No Surprises Act candidate');
    }

    if (query.caseContext?.emergency && topMatch.card.question.toLowerCase().includes('emergency')) {
      reasons.push('emergency scenario match');
    }

    if (query.caseContext?.hasDocuments && topMatch.card.theme.includes('Claims')) {
      reasons.push('document analysis context');
    }

    if (reasons.length === 0) {
      reasons.push('narrative similarity');
    }

    return reasons.join(', ');
  }

  async getCardById(cardId: string): Promise<AnswerCard | null> {
    await this.initialize();
    return this.cache.cards.get(cardId) || null;
  }

  async getCardsByTheme(theme: string): Promise<AnswerCard[]> {
    await this.initialize();
    const cards: AnswerCard[] = [];

    for (const card of this.cache.cards.values()) {
      if (card.theme.toLowerCase() === theme.toLowerCase()) {
        cards.push(card);
      }
    }

    return cards;
  }

  async getAllThemes(): Promise<string[]> {
    await this.initialize();
    const themes = new Set<string>();

    for (const card of this.cache.cards.values()) {
      themes.add(card.theme);
    }

    return Array.from(themes).sort();
  }

  async refreshCache(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  getCacheStats(): { cardCount: number; lastUpdated: string; version: string } {
    return {
      cardCount: this.cache.cards.size,
      lastUpdated: this.cache.lastUpdated,
      version: this.cache.version
    };
  }
}

// Singleton instance
export const qakbRetriever = new QAKBRetriever();

// Export the class for testing
export { QAKBRetriever };

// Utility functions for external use
export async function findAnswerCards(query: QAKBQuery): Promise<QAKBResult> {
  return qakbRetriever.retrieveAnswers(query);
}

export async function getAnswerCardById(cardId: string): Promise<AnswerCard | null> {
  return qakbRetriever.getCardById(cardId);
}

export async function getAnswerCardsByTheme(theme: string): Promise<AnswerCard[]> {
  return qakbRetriever.getCardsByTheme(theme);
}

export async function getAllAvailableThemes(): Promise<string[]> {
  return qakbRetriever.getAllThemes();
}