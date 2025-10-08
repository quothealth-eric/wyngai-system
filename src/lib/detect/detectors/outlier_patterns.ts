import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class OutlierPatternsDetector {
  static readonly RULE_ID = 'OUTLIER_PATTERNS';

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const outlierIssues = this.findOutlierPatterns(context);
    const triggered = outlierIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: OutlierPatternsDetector.RULE_ID,
        triggered: false,
        confidence: 0.70,
        message: 'No significant outlier patterns detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalOutlierAmount = outlierIssues.reduce((sum, issue) =>
      sum + (issue.outlierAmount || 0), 0
    );

    return {
      ruleId: OutlierPatternsDetector.RULE_ID,
      triggered: true,
      confidence: 0.65,
      message: `Found ${outlierIssues.length} statistical outlier patterns`,
      affectedItems: outlierIssues.map(issue => issue.description),
      recommendedAction: 'Review outlier patterns for potential billing irregularities',
      potentialSavings: totalOutlierAmount,
      citations: [{
        title: 'Healthcare Fraud Prevention Guidelines',
        authority: 'Federal',
        citation: 'Statistical analysis for fraud detection and prevention'
      }],
      evidence: outlierIssues.map(issue => ({
        field: 'pattern',
        value: issue.description,
        location: issue.context
      }))
    };
  }

  private findOutlierPatterns(context: DetectionContext): Array<{
    description: string;
    context: string;
    outlierAmount?: MoneyCents;
    severity: 'high' | 'medium' | 'low';
  }> {
    const issues: Array<{
      description: string;
      context: string;
      outlierAmount?: MoneyCents;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    // Check for unusually high total amounts
    if (context.totals.charges > 1000000) { // $10,000+
      issues.push({
        description: `Total charges of $${(context.totals.charges / 100).toFixed(2)} are unusually high for single claim`,
        context: 'Claim totals',
        outlierAmount: context.totals.charges - 500000, // Estimate excess over $5,000
        severity: 'high'
      });
    }

    // Check for unusual number of line items
    if (context.lineItems.length > 50) {
      issues.push({
        description: `${context.lineItems.length} line items is unusually high for single claim`,
        context: 'Claim complexity',
        severity: 'medium'
      });
    }

    // Check for unusual distribution of high-value procedures
    const highValueItems = context.lineItems.filter(item => item.charge && item.charge > 100000); // $1,000+
    if (highValueItems.length > context.lineItems.length * 0.8) {
      issues.push({
        description: `${Math.round((highValueItems.length / context.lineItems.length) * 100)}% of procedures are high-value - unusual distribution`,
        context: 'Procedure distribution',
        severity: 'medium'
      });
    }

    // Check for extreme payment ratios
    const paymentRatio = context.totals.payments / context.totals.charges;
    if (paymentRatio > 1.2) {
      issues.push({
        description: `Payments exceed charges by ${Math.round((paymentRatio - 1) * 100)}% - unusual payment pattern`,
        context: 'Payment ratios',
        severity: 'medium'
      });
    } else if (paymentRatio < 0.1 && context.totals.payments > 0) {
      issues.push({
        description: `Payments are only ${Math.round(paymentRatio * 100)}% of charges - unusual low payment`,
        context: 'Payment ratios',
        severity: 'low'
      });
    }

    // Check for unusual procedure code patterns
    const procedureCodes = context.lineItems
      .filter(item => item.code)
      .map(item => this.getBaseCode(item.code!));
    const uniqueCodes = new Set(procedureCodes);

    // Too many different procedures
    if (uniqueCodes.size > 20) {
      issues.push({
        description: `${uniqueCodes.size} different procedure codes is unusually high for single visit`,
        context: 'Procedure variety',
        severity: 'medium'
      });
    }

    // Check for repetitive patterns (same procedure many times)
    const codeFrequency = new Map<string, number>();
    procedureCodes.forEach(code => {
      codeFrequency.set(code, (codeFrequency.get(code) || 0) + 1);
    });

    codeFrequency.forEach((count, code) => {
      if (count > 10) {
        issues.push({
          description: `Procedure ${code} billed ${count} times - unusually high frequency`,
          context: `Procedure ${code}`,
          severity: count > 20 ? 'high' : 'medium'
        });
      }
    });

    // Check for unusual amount variance within same procedure
    this.checkAmountVariance(context.lineItems, issues);

    return issues;
  }

  private checkAmountVariance(
    lineItems: any[],
    issues: Array<{
      description: string;
      context: string;
      outlierAmount?: MoneyCents;
      severity: 'high' | 'medium' | 'low';
    }>
  ): void {
    // Group by procedure code
    const codeGroups = new Map<string, any[]>();
    lineItems.forEach(item => {
      const baseCode = this.getBaseCode(item.code);
      if (!codeGroups.has(baseCode)) {
        codeGroups.set(baseCode, []);
      }
      codeGroups.get(baseCode)!.push(item);
    });

    codeGroups.forEach((items, code) => {
      if (items.length < 2) return; // Need at least 2 items to check variance

      const amounts = items.map(item => item.charge);
      const min = Math.min(...amounts);
      const max = Math.max(...amounts);
      const variance = max - min;

      // If variance is more than 50% of minimum amount, it's suspicious
      if (variance > min * 0.5) {
        issues.push({
          description: `Procedure ${code} has wide price variance: $${(min / 100).toFixed(2)} to $${(max / 100).toFixed(2)}`,
          context: `Procedure ${code} pricing`,
          severity: 'medium'
        });
      }
    });
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0];
  }
}