import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class PricingAnomaliesDetector {
  static readonly RULE_ID = 'PRICING_ANOMALIES';

  // Rough fee schedule estimates for common procedures
  private readonly typicalPrices = new Map<string, {
    min: MoneyCents;
    max: MoneyCents;
    typical: MoneyCents;
    description: string;
  }>([
    ['99213', { min: 8000, max: 15000, typical: 11500, description: 'Level 3 office visit' }],
    ['99214', { min: 15000, max: 25000, typical: 17000, description: 'Level 4 office visit' }],
    ['85025', { min: 1000, max: 3000, typical: 1500, description: 'Complete blood count' }],
    ['80053', { min: 2000, max: 5000, typical: 3000, description: 'Comprehensive metabolic panel' }],
    ['72148', { min: 120000, max: 200000, typical: 150000, description: 'MRI lumbar spine' }],
    ['74177', { min: 80000, max: 150000, typical: 100000, description: 'CT abdomen/pelvis' }]
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const pricingIssues = this.findPricingAnomalies(context.lineItems);
    const triggered = pricingIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: PricingAnomaliesDetector.RULE_ID,
        triggered: false,
        confidence: 0.70,
        message: 'No significant pricing anomalies detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalAnomalyAmount = pricingIssues.reduce((sum, issue) =>
      sum + (issue.anomalyAmount || 0), 0
    );

    return {
      ruleId: PricingAnomaliesDetector.RULE_ID,
      triggered: true,
      confidence: 0.65,
      message: `Found ${pricingIssues.length} pricing anomalies`,
      affectedItems: pricingIssues.map(issue => issue.code),
      recommendedAction: 'Review pricing for procedures with significant variations from typical amounts',
      potentialSavings: totalAnomalyAmount,
      citations: [{
        title: 'Medicare Physician Fee Schedule',
        authority: 'CMS',
        citation: 'Reference pricing for medical procedures'
      }],
      evidence: pricingIssues.map(issue => ({
        field: 'pricing',
        value: `${issue.code}: ${issue.description}`,
        location: `Service Date: ${issue.serviceDate}`
      }))
    };
  }

  private findPricingAnomalies(lineItems: any[]): Array<{
    code: string;
    serviceDate: string;
    description: string;
    anomalyAmount?: MoneyCents;
    severity: 'high' | 'medium' | 'low';
  }> {
    const issues: Array<{
      code: string;
      serviceDate: string;
      description: string;
      anomalyAmount?: MoneyCents;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    lineItems.forEach(item => {
      const baseCode = this.getBaseCode(item.code);
      const priceRange = this.typicalPrices.get(baseCode);

      if (priceRange) {
        const amount = item.charge;

        if (amount > priceRange.max) {
          const excess = amount - priceRange.max;
          issues.push({
            code: item.code,
            serviceDate: item.serviceDate,
            description: `Price $${(amount / 100).toFixed(2)} exceeds typical range $${(priceRange.min / 100).toFixed(2)}-$${(priceRange.max / 100).toFixed(2)}`,
            anomalyAmount: excess,
            severity: excess > priceRange.typical ? 'high' : 'medium'
          });
        } else if (amount < priceRange.min) {
          issues.push({
            code: item.code,
            serviceDate: item.serviceDate,
            description: `Price $${(amount / 100).toFixed(2)} below typical range $${(priceRange.min / 100).toFixed(2)}-$${(priceRange.max / 100).toFixed(2)} - verify correct procedure`,
            severity: 'low'
          });
        }
      }

      // Check for unusually round numbers (may indicate estimated billing)
      if (this.isUnusuallyRound(item.charge)) {
        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          description: `Round number amount $${(item.charge / 100).toFixed(2)} may indicate estimated billing`,
          severity: 'low'
        });
      }
    });

    return issues;
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0];
  }

  private isUnusuallyRound(amount: MoneyCents): boolean {
    // Check for amounts that are suspiciously round (multiple of $100)
    return amount >= 10000 && amount % 10000 === 0; // $100 increments for amounts >= $100
  }
}