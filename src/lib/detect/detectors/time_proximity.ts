import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class TimeProximityDetector {
  static readonly RULE_ID = 'TIME_PROXIMITY';

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const proximityIssues = this.findTimeProximityIssues(context.lineItems);
    const triggered = proximityIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: TimeProximityDetector.RULE_ID,
        triggered: false,
        confidence: 0.75,
        message: 'No time proximity issues detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalQuestionableAmount = proximityIssues.reduce((sum, issue) =>
      sum + (issue.questionableAmount || 0), 0
    );

    return {
      ruleId: TimeProximityDetector.RULE_ID,
      triggered: true,
      confidence: 0.70,
      message: `Found ${proximityIssues.length} time proximity concerns`,
      affectedItems: proximityIssues.map(issue => issue.description),
      recommendedAction: 'Review services performed within short time periods',
      potentialSavings: totalQuestionableAmount,
      citations: [{
        title: 'Medicare Global Surgery Guidelines',
        authority: 'CMS',
        citation: 'Global surgery periods and related service restrictions'
      }],
      evidence: proximityIssues.map(issue => ({
        field: 'timeProximity',
        value: issue.description,
        location: `Dates: ${issue.dateRange}`
      }))
    };
  }

  private findTimeProximityIssues(lineItems: any[]): Array<{
    description: string;
    dateRange: string;
    questionableAmount?: MoneyCents;
    severity: 'high' | 'medium' | 'low';
  }> {
    const issues: Array<{
      description: string;
      dateRange: string;
      questionableAmount?: MoneyCents;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    // Sort items by date
    const sortedItems = lineItems.sort((a, b) =>
      new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime()
    );

    // Check for duplicate services within short time periods
    for (let i = 0; i < sortedItems.length - 1; i++) {
      const currentItem = sortedItems[i];
      const nextItem = sortedItems[i + 1];

      const currentDate = new Date(currentItem.serviceDate);
      const nextDate = new Date(nextItem.serviceDate);
      const daysDiff = Math.abs((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

      // Same procedures within 7 days
      if (daysDiff <= 7 && this.getBaseCode(currentItem.code) === this.getBaseCode(nextItem.code)) {
        issues.push({
          description: `Same procedure ${currentItem.code} billed within ${Math.round(daysDiff)} days`,
          dateRange: `${currentItem.serviceDate} to ${nextItem.serviceDate}`,
          questionableAmount: Math.min(currentItem.amount, nextItem.amount),
          severity: daysDiff <= 1 ? 'high' : 'medium'
        });
      }

      // Multiple E&M visits within 24 hours
      if (daysDiff <= 1 && this.isEMCode(this.getBaseCode(currentItem.code)) &&
          this.isEMCode(this.getBaseCode(nextItem.code))) {
        issues.push({
          description: 'Multiple E&M visits within 24 hours',
          dateRange: `${currentItem.serviceDate} to ${nextItem.serviceDate}`,
          questionableAmount: Math.min(currentItem.amount, nextItem.amount),
          severity: 'high'
        });
      }
    }

    return issues;
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0];
  }

  private isEMCode(code: string): boolean {
    const codeNum = parseInt(code);
    return (codeNum >= 99201 && codeNum <= 99215) ||
           (codeNum >= 99281 && codeNum <= 99285);
  }
}