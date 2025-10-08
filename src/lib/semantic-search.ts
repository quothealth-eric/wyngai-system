/**
 * Semantic Search Engine for Healthcare Q&A
 *
 * This module provides semantic similarity search capabilities for the healthcare
 * knowledge base using vector embeddings and cosine similarity.
 */

import fs from 'fs';
import path from 'path';

interface KnowledgeCard {
  id: string;
  question: string;
  theme: string;
  answer: string;
  citations: Array<{
    title: string;
    authority: string;
    citation: string;
  }>;
  actionable_steps: string[];
  phone_script: string;
}

interface ThemeBank {
  themes: Array<{
    id: string;
    name: string;
    description: string;
    questions: string[];
  }>;
}

interface SearchResult {
  card: KnowledgeCard;
  similarity: number;
  matchType: 'exact' | 'semantic' | 'theme';
}

export class SemanticSearchEngine {
  private knowledgeCards: KnowledgeCard[] = [];
  private themeBank: ThemeBank | null = null;
  private embeddings: Map<string, number[]> = new Map();

  constructor() {
    this.loadKnowledgeBase();
  }

  private loadKnowledgeBase(): void {
    try {
      // Load knowledge cards
      const cardsPath = path.join(process.cwd(), 'knowledge/cards/cards.jsonl');
      if (fs.existsSync(cardsPath)) {
        const cardsData = fs.readFileSync(cardsPath, 'utf-8');
        const lines = cardsData.trim().split('\n').filter(line => line.trim());
        this.knowledgeCards = lines.map(line => JSON.parse(line) as KnowledgeCard);
        console.log(`📚 Loaded ${this.knowledgeCards.length} knowledge cards`);
      }

      // Load theme bank
      const themesPath = path.join(process.cwd(), 'knowledge/themes/theme_bank.json');
      if (fs.existsSync(themesPath)) {
        const themesData = fs.readFileSync(themesPath, 'utf-8');
        this.themeBank = JSON.parse(themesData) as ThemeBank;
        console.log(`🎯 Loaded ${this.themeBank.themes.length} themes`);
      }
    } catch (error) {
      console.error('Failed to load knowledge base:', error);
    }
  }

  /**
   * Simple text embedding using TF-IDF-like approach
   * In production, this would use a proper embedding model like OpenAI or local sentence transformers
   */
  private createSimpleEmbedding(text: string): number[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    // Create a simple bag-of-words vector
    const vocabulary = [
      'deductible', 'copay', 'coinsurance', 'network', 'provider', 'claim', 'bill', 'eob',
      'insurance', 'coverage', 'premium', 'hmo', 'ppo', 'epo', 'medicare', 'medicaid',
      'cobra', 'hsa', 'fsa', 'prescription', 'formulary', 'appeal', 'denial', 'emergency',
      'surprise', 'balance', 'billing', 'preventive', 'specialist', 'primary', 'care',
      'doctor', 'hospital', 'outpatient', 'inpatient', 'pharmacy', 'drug', 'medication',
      'treatment', 'diagnosis', 'procedure', 'surgery', 'test', 'screening', 'vaccine',
      'cost', 'price', 'payment', 'owe', 'pay', 'money', 'expensive', 'afford',
      'help', 'assistance', 'support', 'negotiate', 'dispute', 'complaint', 'appeal'
    ];

    const vector = new Array(vocabulary.length).fill(0);
    const wordCount = new Map<string, number>();

    // Count word frequencies
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });

    // Create TF-IDF-like vector
    vocabulary.forEach((term, index) => {
      const count = wordCount.get(term) || 0;
      vector[index] = count / words.length; // Simple term frequency
    });

    return vector;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Perform semantic search on the knowledge base
   */
  public async searchKnowledge(query: string): Promise<SearchResult[]> {
    if (this.knowledgeCards.length === 0) {
      console.warn('No knowledge cards loaded');
      return [];
    }

    const queryEmbedding = this.createSimpleEmbedding(query);
    const results: SearchResult[] = [];

    // Search through knowledge cards
    for (const card of this.knowledgeCards) {
      // Check for exact matches first
      const queryLower = query.toLowerCase();
      const questionLower = card.question.toLowerCase();

      if (questionLower.includes(queryLower) || queryLower.includes(questionLower)) {
        results.push({
          card,
          similarity: 1.0,
          matchType: 'exact'
        });
        continue;
      }

      // Semantic similarity
      const cardText = `${card.question} ${card.answer}`;
      const cardEmbedding = this.createSimpleEmbedding(cardText);
      const similarity = this.cosineSimilarity(queryEmbedding, cardEmbedding);

      if (similarity > 0.1) { // Threshold for relevance
        results.push({
          card,
          similarity,
          matchType: 'semantic'
        });
      }
    }

    // Sort by similarity score (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    // Return top 5 results
    return results.slice(0, 5);
  }

  /**
   * Find the most relevant theme for a query
   */
  public findRelevantThemes(query: string): string[] {
    if (!this.themeBank) return [];

    const queryLower = query.toLowerCase();
    const relevantThemes: Array<{ id: string; score: number }> = [];

    for (const theme of this.themeBank.themes) {
      let score = 0;

      // Check theme name and description
      if (theme.name.toLowerCase().includes(queryLower)) score += 3;
      if (theme.description.toLowerCase().includes(queryLower)) score += 2;

      // Check theme questions
      for (const question of theme.questions) {
        if (question.toLowerCase().includes(queryLower)) score += 1;
      }

      if (score > 0) {
        relevantThemes.push({ id: theme.id, score });
      }
    }

    // Sort by relevance score
    relevantThemes.sort((a, b) => b.score - a.score);

    return relevantThemes.slice(0, 3).map(t => t.id);
  }

  /**
   * Get all cards for a specific theme
   */
  public getCardsByTheme(themeId: string): KnowledgeCard[] {
    return this.knowledgeCards.filter(card => card.theme === themeId);
  }

  /**
   * Get theme information by ID
   */
  public getThemeInfo(themeId: string) {
    return this.themeBank?.themes.find(theme => theme.id === themeId);
  }

  /**
   * Enhanced search that combines semantic similarity with theme matching
   */
  public async comprehensiveSearch(query: string): Promise<{
    cards: SearchResult[];
    relevantThemes: string[];
    suggestedQuestions: string[];
  }> {
    const cards = await this.searchKnowledge(query);
    const relevantThemes = this.findRelevantThemes(query);

    // Generate suggested questions based on relevant themes
    const suggestedQuestions: string[] = [];
    for (const themeId of relevantThemes.slice(0, 2)) {
      const theme = this.getThemeInfo(themeId);
      if (theme) {
        suggestedQuestions.push(...theme.questions.slice(0, 3));
      }
    }

    return {
      cards,
      relevantThemes,
      suggestedQuestions: suggestedQuestions.slice(0, 6)
    };
  }
}

// Singleton instance
let searchEngine: SemanticSearchEngine | null = null;

export function getSearchEngine(): SemanticSearchEngine {
  if (!searchEngine) {
    searchEngine = new SemanticSearchEngine();
  }
  return searchEngine;
}