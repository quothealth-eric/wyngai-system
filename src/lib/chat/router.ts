import { ThemeClassification, MergedCase } from '@/types/qakb';
import fs from 'fs';
import path from 'path';

interface ThemeQuestion {
  question: string;
  keywords: string[];
  priority: "high" | "medium" | "low";
}

interface ThemeCategory {
  category: string;
  subcategories?: string[];
  questions: ThemeQuestion[];
}

interface ThemeBank {
  categories: ThemeCategory[];
}

export class ThemeRouter {
  private themeBank: ThemeBank | null = null;

  async initialize(): Promise<void> {
    if (this.themeBank) return;

    try {
      const themeBankPath = path.join(process.cwd(), 'knowledge', 'theme_bank.json');
      const themeBankData = JSON.parse(fs.readFileSync(themeBankPath, 'utf8'));
      this.themeBank = themeBankData;
    } catch (error) {
      console.error('Failed to load theme bank:', error);
      throw error;
    }
  }

  async classifyThemes(narrative: string, mergedCase?: MergedCase): Promise<ThemeClassification> {
    await this.initialize();

    if (!this.themeBank) {
      throw new Error('Theme bank not initialized');
    }

    const narrativeLower = narrative.toLowerCase();
    const narrativeWords = this.tokenize(narrativeLower);

    // Include OCR text if available
    let combinedText = narrativeLower;
    if (mergedCase) {
      const ocrTexts = mergedCase.documents.map(d => d.ocrText.toLowerCase()).join(' ');
      combinedText += ' ' + ocrTexts;
    }
    const combinedWords = this.tokenize(combinedText);

    const themeScores = new Map<string, number>();
    const matchingQuestions: ThemeClassification['matchingQuestions'] = [];

    // Score each theme category
    for (const category of this.themeBank.categories) {
      let categoryScore = 0;
      const categoryKeywordMatches: string[] = [];

      // Direct category name matching
      if (narrativeLower.includes(category.category.toLowerCase())) {
        categoryScore += 2.0;
        categoryKeywordMatches.push(category.category);
      }

      // Subcategory matching
      if (category.subcategories) {
        for (const subcategory of category.subcategories) {
          if (combinedText.includes(subcategory.toLowerCase())) {
            categoryScore += 1.5;
            categoryKeywordMatches.push(subcategory);
          }
        }
      }

      // Question-level matching
      for (const question of category.questions) {
        const questionScore = this.scoreQuestion(question, combinedWords, mergedCase);

        if (questionScore > 0.3) {
          const keywordMatches = this.getKeywordMatches(question.keywords, combinedWords);

          matchingQuestions.push({
            cardId: this.generateCardId(category.category, question.question),
            question: question.question,
            confidence: questionScore,
            keywordMatches
          });

          // Add to category score with priority weighting
          const priorityMultiplier = question.priority === 'high' ? 1.2 :
                                   question.priority === 'medium' ? 1.0 : 0.8;
          categoryScore += questionScore * priorityMultiplier;
        }
      }

      // Context-based boosting
      categoryScore += this.applyContextBoosts(category.category, mergedCase);

      if (categoryScore > 0.5) {
        themeScores.set(category.category, categoryScore);
      }
    }

    // Sort themes by score and select top themes
    const sortedThemes = Array.from(themeScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // Top 5 themes
      .map(([theme]) => theme);

    // Calculate overall confidence
    const topScore = Math.max(...Array.from(themeScores.values()));
    const confidence = Math.min(topScore / 3.0, 1.0); // Normalize to 0-1

    // Sort matching questions by confidence
    matchingQuestions.sort((a, b) => b.confidence - a.confidence);

    return {
      themes: sortedThemes,
      confidence,
      matchingQuestions: matchingQuestions.slice(0, 10) // Top 10 matching questions
    };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  private scoreQuestion(
    question: ThemeQuestion,
    textWords: string[],
    mergedCase?: MergedCase
  ): number {
    let score = 0;

    // Keyword matching
    const keywordMatches = this.getKeywordMatches(question.keywords, textWords);
    score += keywordMatches.length * 0.3;

    // Question text similarity
    const questionWords = this.tokenize(question.question);
    const questionMatches = questionWords.filter(qw =>
      textWords.some(tw => tw.includes(qw) || qw.includes(tw))
    );
    score += questionMatches.length * 0.2;

    // Priority bonus
    const priorityBonus = question.priority === 'high' ? 0.3 :
                         question.priority === 'medium' ? 0.2 : 0.1;
    score += priorityBonus;

    return Math.min(score, 1.0);
  }

  private getKeywordMatches(keywords: string[], textWords: string[]): string[] {
    const matches: string[] = [];

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();

      // Exact match
      if (textWords.includes(keywordLower)) {
        matches.push(keyword);
        continue;
      }

      // Partial match
      const hasPartialMatch = textWords.some(word =>
        word.includes(keywordLower) || keywordLower.includes(word)
      );

      if (hasPartialMatch) {
        matches.push(keyword);
      }
    }

    return matches;
  }

  private applyContextBoosts(categoryName: string, mergedCase?: MergedCase): number {
    if (!mergedCase) return 0;

    let boost = 0;

    // Inferred context boosts
    if (mergedCase.inferred) {
      if (categoryName === 'OON/Balance Billing' && mergedCase.inferred.nsaCandidate) {
        boost += 1.0;
      }

      if (categoryName === 'Specific Care Scenarios' && mergedCase.inferred.emergency) {
        boost += 0.8;
      }

      if (categoryName === 'Claims/Billing/EOB/Appeals' && mergedCase.documents.length > 1) {
        boost += 0.6;
      }
    }

    // Document type boosts
    const hasEOB = mergedCase.documents.some(d => d.docType === 'EOB');
    const hasBill = mergedCase.documents.some(d => d.docType === 'BILL');

    if (categoryName === 'Claims/Billing/EOB/Appeals') {
      if (hasEOB) boost += 0.5;
      if (hasBill) boost += 0.3;
    }

    // Line item boosts
    if (mergedCase.matchedLineItems && mergedCase.matchedLineItems.length > 0) {
      if (categoryName === 'Costs') boost += 0.4;
      if (categoryName === 'Networks & Access') boost += 0.3;
    }

    // Financial context boosts
    if (mergedCase.consolidatedTotals) {
      const { billed, planPaid, patientResp } = mergedCase.consolidatedTotals;

      // High patient responsibility suggests cost/billing issues
      if (patientResp && billed && (patientResp / billed) > 0.5) {
        if (categoryName === 'Costs') boost += 0.5;
        if (categoryName === 'Claims/Billing/EOB/Appeals') boost += 0.3;
      }

      // Large total amounts suggest complex cases
      if (billed && billed > 100000) { // >$1000
        if (categoryName === 'Big Bills/Hardship') boost += 0.4;
      }
    }

    return boost;
  }

  private generateCardId(category: string, question: string): string {
    const normalized = `${category}-${question}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return normalized.substring(0, 50);
  }

  // Utility method to get all available themes
  async getAllThemes(): Promise<string[]> {
    await this.initialize();

    if (!this.themeBank) {
      return [];
    }

    return this.themeBank.categories.map(c => c.category);
  }

  // Get questions for a specific theme
  async getThemeQuestions(themeName: string): Promise<ThemeQuestion[]> {
    await this.initialize();

    if (!this.themeBank) {
      return [];
    }

    const category = this.themeBank.categories.find(c =>
      c.category.toLowerCase() === themeName.toLowerCase()
    );

    return category?.questions || [];
  }

  // Suggest related themes based on current classification
  async suggestRelatedThemes(currentThemes: string[], limit = 3): Promise<string[]> {
    await this.initialize();

    if (!this.themeBank) {
      return [];
    }

    const relatedThemes = new Set<string>();

    // Define theme relationships
    const themeRelationships: Record<string, string[]> = {
      'Claims/Billing/EOB/Appeals': ['Costs', 'Networks & Access', 'OON/Balance Billing'],
      'OON/Balance Billing': ['Claims/Billing/EOB/Appeals', 'Networks & Access', 'Costs'],
      'Costs': ['Claims/Billing/EOB/Appeals', 'Plan Types & Choosing', 'HSA/FSA/HRA'],
      'Networks & Access': ['Claims/Billing/EOB/Appeals', 'OON/Balance Billing', 'Plan Types & Choosing'],
      'Emergency Care': ['OON/Balance Billing', 'Specific Care Scenarios', 'Networks & Access'],
      'Prescriptions': ['Costs', 'Networks & Access', 'Claims/Billing/EOB/Appeals'],
      'Government Programs': ['Enrollment & Switching', 'Subsidies & Taxes', 'Extra Nuances'],
      'Big Bills/Hardship': ['Claims/Billing/EOB/Appeals', 'Costs', 'Government Programs']
    };

    for (const theme of currentThemes) {
      const related = themeRelationships[theme] || [];
      related.forEach(t => {
        if (!currentThemes.includes(t)) {
          relatedThemes.add(t);
        }
      });
    }

    return Array.from(relatedThemes).slice(0, limit);
  }
}

// Export singleton instance
export const themeRouter = new ThemeRouter();