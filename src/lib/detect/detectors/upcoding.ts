import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class UpcodingDetector {
  static readonly RULE_ID = 'UPCODING';

  // Code level hierarchies and expected relationships
  private readonly codeHierarchies = new Map<string, {
    level: number;
    description: string;
    typicalAmount: MoneyCents;
    requiredComplexity: string[];
  }>([
    // E&M Office Visit Levels
    ['99211', { level: 1, description: 'Level 1 Office Visit', typicalAmount: 4500, requiredComplexity: ['minimal'] }],
    ['99212', { level: 2, description: 'Level 2 Office Visit', typicalAmount: 8000, requiredComplexity: ['straightforward'] }],
    ['99213', { level: 3, description: 'Level 3 Office Visit', typicalAmount: 11500, requiredComplexity: ['low complexity'] }],
    ['99214', { level: 4, description: 'Level 4 Office Visit', typicalAmount: 17000, requiredComplexity: ['moderate complexity'] }],
    ['99215', { level: 5, description: 'Level 5 Office Visit', typicalAmount: 22500, requiredComplexity: ['high complexity'] }],

    // Surgery complexity levels (simplified examples)
    ['25600', { level: 2, description: 'Simple fracture treatment', typicalAmount: 45000, requiredComplexity: ['closed treatment'] }],
    ['25605', { level: 3, description: 'Fracture with manipulation', typicalAmount: 65000, requiredComplexity: ['manipulation required'] }],
    ['25607', { level: 4, description: 'Complex fracture treatment', typicalAmount: 85000, requiredComplexity: ['open treatment', 'internal fixation'] }],

    // Consultation levels
    ['99241', { level: 1, description: 'Level 1 Consultation', typicalAmount: 7500, requiredComplexity: ['straightforward'] }],
    ['99242', { level: 2, description: 'Level 2 Consultation', typicalAmount: 12000, requiredComplexity: ['low complexity'] }],
    ['99243', { level: 3, description: 'Level 3 Consultation', typicalAmount: 17500, requiredComplexity: ['moderate complexity'] }],
    ['99244', { level: 4, description: 'Level 4 Consultation', typicalAmount: 25000, requiredComplexity: ['moderate to high complexity'] }],
    ['99245', { level: 5, description: 'Level 5 Consultation', typicalAmount: 35000, requiredComplexity: ['high complexity'] }]
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const upcodingIssues = this.findUpcodingPatterns(context.lineItems, context.provider);
    const triggered = upcodingIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: UpcodingDetector.RULE_ID,
        triggered: false,
        confidence: 0.75,
        message: 'No upcoding patterns detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalOvercharge = upcodingIssues.reduce((sum, issue) =>
      sum + (issue.suspectedOvercharge || 0), 0
    );

    const affectedItems = upcodingIssues.map(issue => issue.code);

    return {
      ruleId: UpcodingDetector.RULE_ID,
      triggered: true,
      confidence: 0.72,
      message: `Found ${upcodingIssues.length} potential upcoding issues`,
      affectedItems,
      recommendedAction: 'Request documentation to support billed code level/complexity',
      potentialSavings: totalOvercharge,
      citations: [{
        title: 'Medicare Program Integrity Manual',
        authority: 'CMS',
        citation: 'Chapter 3 - Verifying Potential Errors and Reviewing Documentation'
      }, {
        title: 'Evaluation and Management Services Guidelines',
        authority: 'CMS',
        citation: '1995 and 1997 Documentation Guidelines for E&M Services'
      }],
      evidence: upcodingIssues.map(issue => ({
        field: 'procedureCode',
        value: `${issue.code}: ${issue.reason}`,
        location: `Service Date: ${issue.serviceDate}`
      }))
    };
  }

  private findUpcodingPatterns(lineItems: any[], provider: any): Array<{
    code: string;
    serviceDate: string;
    reason: string;
    suspectedOvercharge?: MoneyCents;
    recommendedCode?: string;
  }> {
    const issues: Array<{
      code: string;
      serviceDate: string;
      reason: string;
      suspectedOvercharge?: MoneyCents;
      recommendedCode?: string;
    }> = [];

    // Analyze each line item for upcoding patterns
    lineItems.forEach(item => {
      const baseCode = this.getBaseCode(item.code);
      const hierarchy = this.codeHierarchies.get(baseCode);

      if (!hierarchy) return; // Skip codes we don't have hierarchy data for

      // Check 1: Unusually high level codes
      const unusuallyHighLevel = this.isUnusuallyHighLevel(baseCode, item.charge, provider);
      if (unusuallyHighLevel) {
        const recommendedLevel = this.getRecommendedLevel(baseCode);
        const potentialSavings = this.calculatePotentialSavings(baseCode, recommendedLevel);

        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          reason: `Level ${hierarchy.level} code may be higher than justified for typical ${provider.specialty || 'provider'} visit`,
          suspectedOvercharge: potentialSavings,
          recommendedCode: recommendedLevel
        });
      }

      // Check 2: Amount significantly above typical for code
      if (item.charge > hierarchy.typicalAmount * 1.5) {
        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          reason: `Billed amount $${(item.charge / 100).toFixed(2)} is ${Math.round((item.charge / hierarchy.typicalAmount - 1) * 100)}% above typical for ${baseCode}`,
          suspectedOvercharge: item.charge - hierarchy.typicalAmount
        });
      }

      // Check 3: Sequential high-level codes pattern
      const hasSequentialPattern = this.checkSequentialHighLevelPattern(lineItems, item, baseCode);
      if (hasSequentialPattern) {
        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          reason: 'Pattern of consistently high-level codes may indicate systematic upcoding'
        });
      }
    });

    // Check for provider-specific patterns
    const providerPatterns = this.analyzeProviderPatterns(lineItems, provider);
    issues.push(...providerPatterns);

    return issues;
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0]; // Remove modifiers
  }

  private isUnusuallyHighLevel(code: string, amount: MoneyCents, provider: any): boolean {
    const hierarchy = this.codeHierarchies.get(code);
    if (!hierarchy) return false;

    // Level 4 and 5 E&M codes are unusual for routine visits
    if (hierarchy.level >= 4 && this.isEMCode(code)) {
      // Check if provider specialty supports high complexity
      const highComplexitySpecialties = [
        'cardiology', 'oncology', 'neurology', 'endocrinology',
        'rheumatology', 'infectious disease', 'pulmonology'
      ];

      const providerSpecialty = (provider.specialty || '').toLowerCase();
      const isHighComplexitySpecialty = highComplexitySpecialties.some(specialty =>
        providerSpecialty.includes(specialty)
      );

      // More suspicious for primary care providers
      if (!isHighComplexitySpecialty && hierarchy.level === 5) {
        return true;
      }
    }

    return false;
  }

  private getRecommendedLevel(code: string): string {
    const hierarchy = this.codeHierarchies.get(code);
    if (!hierarchy) return code;

    // Recommend one level down for high-level codes
    const codeBase = parseInt(code);
    if (hierarchy.level >= 4) {
      return (codeBase - 1).toString();
    }

    return code;
  }

  private calculatePotentialSavings(currentCode: string, recommendedCode: string): MoneyCents {
    const currentHierarchy = this.codeHierarchies.get(currentCode);
    const recommendedHierarchy = this.codeHierarchies.get(recommendedCode);

    if (!currentHierarchy || !recommendedHierarchy) return 0;

    return Math.max(0, currentHierarchy.typicalAmount - recommendedHierarchy.typicalAmount);
  }

  private checkSequentialHighLevelPattern(lineItems: any[], currentItem: any, baseCode: string): boolean {
    // Look for pattern of multiple high-level codes from same provider
    const sameCodeItems = lineItems.filter(item =>
      this.getBaseCode(item.code) === baseCode
    );

    if (sameCodeItems.length < 3) return false;

    const hierarchy = this.codeHierarchies.get(baseCode);
    if (!hierarchy || hierarchy.level < 4) return false;

    // If more than 70% of same codes are high level, it's suspicious
    const highLevelCount = sameCodeItems.filter(item => {
      const itemHierarchy = this.codeHierarchies.get(this.getBaseCode(item.code));
      return itemHierarchy && itemHierarchy.level >= 4;
    }).length;

    return (highLevelCount / sameCodeItems.length) > 0.7;
  }

  private analyzeProviderPatterns(lineItems: any[], provider: any): Array<{
    code: string;
    serviceDate: string;
    reason: string;
    suspectedOvercharge?: MoneyCents;
    recommendedCode?: string;
  }> {
    const patterns: Array<{
      code: string;
      serviceDate: string;
      reason: string;
      suspectedOvercharge?: MoneyCents;
      recommendedCode?: string;
    }> = [];

    // Calculate distribution of E&M levels
    const emCodes = lineItems.filter(item => this.isEMCode(this.getBaseCode(item.code)));

    if (emCodes.length >= 5) {
      const levelCounts = new Map<number, number>();

      emCodes.forEach(item => {
        const hierarchy = this.codeHierarchies.get(this.getBaseCode(item.code));
        if (hierarchy) {
          levelCounts.set(hierarchy.level, (levelCounts.get(hierarchy.level) || 0) + 1);
        }
      });

      // Check for unusual distribution (too many high-level codes)
      const level4Count = levelCounts.get(4) || 0;
      const level5Count = levelCounts.get(5) || 0;
      const totalHighLevel = level4Count + level5Count;
      const totalEM = emCodes.length;

      // National averages suggest 15-25% level 4, 5-10% level 5
      if (totalHighLevel / totalEM > 0.4) {
        patterns.push({
          code: 'PATTERN_ANALYSIS',
          serviceDate: 'MULTIPLE',
          reason: `${Math.round((totalHighLevel / totalEM) * 100)}% high-level E&M codes exceeds typical distribution (20-35%)`,
          suspectedOvercharge: Math.floor(totalHighLevel * 5000) // Rough estimate
        });
      }
    }

    return patterns;
  }

  private isEMCode(code: string): boolean {
    const codeNum = parseInt(code);
    return (codeNum >= 99201 && codeNum <= 99215) || // Office visits
           (codeNum >= 99241 && codeNum <= 99245) || // Consultations
           (codeNum >= 99221 && codeNum <= 99233) || // Initial hospital care
           (codeNum >= 99281 && codeNum <= 99285);   // Emergency department
  }
}