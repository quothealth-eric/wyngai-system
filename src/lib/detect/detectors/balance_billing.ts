import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class BalanceBillingDetector {
  static readonly RULE_ID = 'BALANCE_BILLING';

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const balanceBillingIssues = this.findBalanceBillingIssues(context);
    const triggered = balanceBillingIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: BalanceBillingDetector.RULE_ID,
        triggered: false,
        confidence: 0.80,
        message: 'No balance billing violations detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalViolationAmount = balanceBillingIssues.reduce((sum, issue) =>
      sum + (issue.violationAmount || 0), 0
    );

    return {
      ruleId: BalanceBillingDetector.RULE_ID,
      triggered: true,
      confidence: 0.75,
      message: `Found ${balanceBillingIssues.length} potential balance billing violations`,
      affectedItems: balanceBillingIssues.map(issue => issue.description),
      recommendedAction: 'Review balance billing practices and verify compliance with No Surprises Act',
      potentialSavings: totalViolationAmount,
      citations: [{
        title: 'No Surprises Act',
        authority: 'Federal',
        citation: 'Protection against surprise medical bills and balance billing'
      }],
      evidence: balanceBillingIssues.map(issue => ({
        field: 'billing',
        value: issue.description,
        location: `Amount: $${(issue.violationAmount || 0) / 100}`
      }))
    };
  }

  private findBalanceBillingIssues(context: DetectionContext): Array<{
    description: string;
    violationAmount?: MoneyCents;
    severity: 'high' | 'medium' | 'low';
  }> {
    const issues: Array<{
      description: string;
      violationAmount?: MoneyCents;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    // Check for excessive patient responsibility
    if (context.totals.balance > context.totals.charges * 0.5) {
      issues.push({
        description: 'Patient balance exceeds 50% of total charges - review for balance billing',
        violationAmount: context.totals.balance - Math.floor(context.totals.charges * 0.3),
        severity: 'high'
      });
    }

    // Check for charges without corresponding payments/adjustments
    const unadjustedCharges = context.totals.charges - context.totals.payments - context.totals.adjustments;
    if (unadjustedCharges > context.totals.charges * 0.8) {
      issues.push({
        description: 'Most charges lack insurance adjustments - potential out-of-network balance billing',
        severity: 'medium'
      });
    }

    return issues;
  }
}