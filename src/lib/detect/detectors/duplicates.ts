import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class DuplicatesDetector {
  static readonly RULE_ID = 'DUPLICATES';

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const duplicateGroups = this.findDuplicateLineItems(context.lineItems);
    const triggered = duplicateGroups.length > 0;

    if (!triggered) {
      return {
        ruleId: DuplicatesDetector.RULE_ID,
        triggered: false,
        confidence: 0.95,
        message: 'No duplicate charges detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalDuplicateAmount = duplicateGroups.reduce((sum, group) =>
      sum + (group.items.length - 1) * group.amount, 0
    );

    const affectedItems = duplicateGroups.flatMap(group =>
      group.items.slice(1).map(item => item.description)
    );

    return {
      ruleId: DuplicatesDetector.RULE_ID,
      triggered: true,
      confidence: 0.92,
      message: `Found ${duplicateGroups.length} sets of duplicate charges`,
      affectedItems,
      recommendedAction: 'Review duplicate charges with provider - potential billing error',
      potentialSavings: totalDuplicateAmount,
      citations: [{
        title: 'Medicare Claims Processing Manual, Chapter 1',
        authority: 'CMS',
        citation: '§1.5.3 - Duplicate claim submissions are prohibited'
      }],
      evidence: duplicateGroups.flatMap(group =>
        group.items.map(item => ({
          field: 'lineItem',
          value: `${item.code} - ${item.description} - $${(item.charge / 100).toFixed(2)}`,
          location: `Service Date: ${item.serviceDate}`
        }))
      )
    };
  }

  private findDuplicateLineItems(lineItems: any[]): Array<{
    code: string;
    amount: MoneyCents;
    items: any[];
  }> {
    const groups = new Map<string, any[]>();

    // Group by procedure code, service date, and amount
    lineItems.forEach(item => {
      const key = `${item.code}-${item.serviceDate}-${item.charge}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    });

    // Return groups with more than one item (duplicates)
    return Array.from(groups.entries())
      .filter(([_, items]) => items.length > 1)
      .map(([key, items]) => {
        const [code] = key.split('-');
        return {
          code,
          amount: items[0].amount,
          items
        };
      });
  }
}