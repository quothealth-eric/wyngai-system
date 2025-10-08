import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class FrequencyLimitsDetector {
  static readonly RULE_ID = 'FREQUENCY_LIMITS';

  // Common frequency limits for medical procedures
  private readonly frequencyLimits = new Map<string, {
    period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'lifetime';
    limit: number;
    description: string;
    exceptions?: string[];
  }>([
    // Preventive care
    ['G0008', { period: 'yearly', limit: 1, description: 'Cervical cancer screening - Annual limit' }],
    ['G0009', { period: 'yearly', limit: 1, description: 'Pelvic exam - Annual limit' }],
    ['77067', { period: 'yearly', limit: 1, description: 'Screening mammography - Annual limit' }],
    ['82270', { period: 'yearly', limit: 1, description: 'Fecal occult blood test - Annual limit' }],
    ['G0121', { period: 'yearly', limit: 1, description: 'Colorectal cancer screening - Annual limit' }],

    // Therapeutic injections
    ['20610', { period: 'monthly', limit: 2, description: 'Joint injection - Monthly limit' }],
    ['64483', { period: 'yearly', limit: 4, description: 'Epidural injection - Yearly limit' }],
    ['64635', { period: 'yearly', limit: 3, description: 'Facet joint denervation - Yearly limit' }],

    // Imaging studies
    ['74177', { period: 'yearly', limit: 2, description: 'CT abdomen with contrast - Yearly limit', exceptions: ['cancer monitoring'] }],
    ['72148', { period: 'yearly', limit: 2, description: 'MRI lumbar spine - Yearly limit' }],
    ['78306', { period: 'yearly', limit: 1, description: 'Bone scan - Annual limit' }],

    // Durable medical equipment
    ['E0784', { period: 'yearly', limit: 1, description: 'CPAP machine - Annual replacement' }],
    ['E0601', { period: 'yearly', limit: 1, description: 'CPAP mask - Annual replacement' }],
    ['K0001', { period: 'yearly', limit: 1, description: 'Standard wheelchair - Annual replacement' }],

    // Physical therapy
    ['97110', { period: 'yearly', limit: 36, description: 'Physical therapy - Annual visit limit' }],
    ['97112', { period: 'yearly', limit: 36, description: 'Neuromuscular reeducation - Annual limit' }],

    // Mental health
    ['90834', { period: 'weekly', limit: 2, description: 'Psychotherapy 45 min - Weekly limit' }],
    ['90837', { period: 'weekly', limit: 1, description: 'Psychotherapy 60 min - Weekly limit' }],

    // Laboratory tests
    ['85025', { period: 'monthly', limit: 1, description: 'Complete blood count - Monthly limit' }],
    ['80053', { period: 'yearly', limit: 4, description: 'Comprehensive metabolic panel - Quarterly' }],
    ['83036', { period: 'yearly', limit: 2, description: 'Hemoglobin A1C - Semi-annual' }],

    // Surgical procedures (one-time or rare)
    ['66984', { period: 'lifetime', limit: 2, description: 'Cataract surgery - Per eye lifetime' }],
    ['27447', { period: 'lifetime', limit: 2, description: 'Knee replacement - Per knee lifetime' }],

    // Emergency/urgent care
    ['99283', { period: 'daily', limit: 1, description: 'Emergency department visit - Daily limit' }],
    ['99213', { period: 'daily', limit: 1, description: 'Office visit - Daily limit' }]
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const frequencyViolations = this.findFrequencyViolations(context.lineItems);
    const triggered = frequencyViolations.length > 0;

    if (!triggered) {
      return {
        ruleId: FrequencyLimitsDetector.RULE_ID,
        triggered: false,
        confidence: 0.88,
        message: 'No frequency limit violations detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalExcessAmount = frequencyViolations.reduce((sum, violation) =>
      sum + violation.excessAmount, 0
    );

    const affectedItems = frequencyViolations.map(violation => violation.code);

    return {
      ruleId: FrequencyLimitsDetector.RULE_ID,
      triggered: true,
      confidence: 0.85,
      message: `Found ${frequencyViolations.length} frequency limit violations`,
      affectedItems,
      recommendedAction: 'Verify medical necessity for services exceeding frequency limits',
      potentialSavings: totalExcessAmount,
      citations: [{
        title: 'Medicare Coverage Guidelines',
        authority: 'CMS',
        citation: 'Local Coverage Determinations (LCDs) specify frequency limits'
      }, {
        title: 'Medicare Benefit Policy Manual',
        authority: 'CMS',
        citation: 'Chapter 15 - Covered Medical and Other Health Services'
      }],
      evidence: frequencyViolations.map(violation => ({
        field: 'frequency',
        value: `${violation.code}: ${violation.actualCount} services in ${violation.period} (limit: ${violation.allowedLimit})`,
        location: `Period: ${violation.periodStart} to ${violation.periodEnd}`
      }))
    };
  }

  private findFrequencyViolations(lineItems: any[]): Array<{
    code: string;
    period: string;
    actualCount: number;
    allowedLimit: number;
    excessAmount: MoneyCents;
    periodStart: string;
    periodEnd: string;
  }> {
    const violations: Array<{
      code: string;
      period: string;
      actualCount: number;
      allowedLimit: number;
      excessAmount: MoneyCents;
      periodStart: string;
      periodEnd: string;
    }> = [];

    // Group items by base code
    const itemsByCode = new Map<string, any[]>();
    lineItems.forEach(item => {
      const baseCode = this.getBaseCode(item.code);
      if (!itemsByCode.has(baseCode)) {
        itemsByCode.set(baseCode, []);
      }
      itemsByCode.get(baseCode)!.push(item);
    });

    // Check frequency limits for each code
    itemsByCode.forEach((items, code) => {
      const limit = this.frequencyLimits.get(code);
      if (!limit) return; // No frequency limit defined for this code

      // Group items by the relevant time period
      const periodGroups = this.groupByPeriod(items, limit.period);

      periodGroups.forEach(group => {
        if (group.items.length > limit.limit) {
          const excessCount = group.items.length - limit.limit;
          const excessItems = group.items.slice(limit.limit); // Items beyond the limit

          const excessAmount = excessItems.reduce((sum, item) => sum + item.charge, 0);

          violations.push({
            code,
            period: limit.period,
            actualCount: group.items.length,
            allowedLimit: limit.limit,
            excessAmount,
            periodStart: group.periodStart,
            periodEnd: group.periodEnd
          });
        }
      });
    });

    return violations;
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0]; // Remove modifiers
  }

  private groupByPeriod(items: any[], period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'lifetime'): Array<{
    items: any[];
    periodStart: string;
    periodEnd: string;
  }> {
    if (period === 'lifetime') {
      // All items in one group for lifetime limits
      const dates = items.map(item => new Date(item.serviceDate)).sort();
      return [{
        items,
        periodStart: dates[0]?.toISOString().split('T')[0] || 'unknown',
        periodEnd: dates[dates.length - 1]?.toISOString().split('T')[0] || 'unknown'
      }];
    }

    const groups = new Map<string, any[]>();

    items.forEach(item => {
      const serviceDate = new Date(item.serviceDate);
      let periodKey: string;

      switch (period) {
        case 'daily':
          periodKey = serviceDate.toISOString().split('T')[0];
          break;
        case 'weekly':
          // Get Monday of the week
          const weekStart = new Date(serviceDate);
          weekStart.setDate(serviceDate.getDate() - serviceDate.getDay() + 1);
          periodKey = weekStart.toISOString().split('T')[0];
          break;
        case 'monthly':
          periodKey = `${serviceDate.getFullYear()}-${String(serviceDate.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'yearly':
          periodKey = serviceDate.getFullYear().toString();
          break;
        default:
          periodKey = 'unknown';
      }

      if (!groups.has(periodKey)) {
        groups.set(periodKey, []);
      }
      groups.get(periodKey)!.push(item);
    });

    return Array.from(groups.entries()).map(([periodKey, items]) => {
      const dates = items.map(item => new Date(item.serviceDate)).sort();

      let periodStart: string, periodEnd: string;

      switch (period) {
        case 'daily':
          periodStart = periodEnd = periodKey;
          break;
        case 'weekly':
          periodStart = periodKey;
          const weekEndDate = new Date(periodKey);
          weekEndDate.setDate(weekEndDate.getDate() + 6);
          periodEnd = weekEndDate.toISOString().split('T')[0];
          break;
        case 'monthly':
          const [year, month] = periodKey.split('-');
          periodStart = `${year}-${month}-01`;
          const monthEndDate = new Date(parseInt(year), parseInt(month), 0);
          periodEnd = monthEndDate.toISOString().split('T')[0];
          break;
        case 'yearly':
          periodStart = `${periodKey}-01-01`;
          periodEnd = `${periodKey}-12-31`;
          break;
        default:
          periodStart = dates[0]?.toISOString().split('T')[0] || 'unknown';
          periodEnd = dates[dates.length - 1]?.toISOString().split('T')[0] || 'unknown';
      }

      return {
        items,
        periodStart,
        periodEnd
      };
    });
  }
}