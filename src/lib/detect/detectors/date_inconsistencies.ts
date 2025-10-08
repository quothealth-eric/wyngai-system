import { DetectionResult, DetectionContext } from '../types';

export class DateInconsistenciesDetector {
  static readonly RULE_ID = 'DATE_INCONSISTENCIES';

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const dateIssues = this.findDateInconsistencies(context);
    const triggered = dateIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: DateInconsistenciesDetector.RULE_ID,
        triggered: false,
        confidence: 0.90,
        message: 'No date inconsistencies detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    return {
      ruleId: DateInconsistenciesDetector.RULE_ID,
      triggered: true,
      confidence: 0.87,
      message: `Found ${dateIssues.length} date inconsistencies`,
      affectedItems: dateIssues.map(issue => issue.description),
      recommendedAction: 'Verify and correct date inconsistencies',
      citations: [{
        title: 'Medicare Claims Processing Manual',
        authority: 'CMS',
        citation: 'Chapter 1 - Accurate date reporting requirements'
      }],
      evidence: dateIssues.map(issue => ({
        field: 'dates',
        value: issue.description,
        location: issue.context
      }))
    };
  }

  private findDateInconsistencies(context: DetectionContext): Array<{
    description: string;
    context: string;
    severity: 'high' | 'medium' | 'low';
  }> {
    const issues: Array<{
      description: string;
      context: string;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    // Check for future service dates
    const today = new Date();
    context.lineItems.forEach(item => {
      if (item.dos) {
        const serviceDate = new Date(item.dos);
        if (serviceDate > today) {
          const daysFuture = Math.ceil((serviceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          issues.push({
            description: `Service date ${item.dos} is ${daysFuture} days in the future`,
            context: `Code: ${item.code}`,
            severity: daysFuture > 30 ? 'high' : 'medium'
          });
        }
      }
    });

    // Check service date vs billing date consistency
    if (context.dates.serviceDate && context.dates.billingDate) {
      const serviceDate = new Date(context.dates.serviceDate);
      const billingDate = new Date(context.dates.billingDate);

      if (billingDate < serviceDate) {
        issues.push({
          description: `Billing date ${context.dates.billingDate} is before service date ${context.dates.serviceDate}`,
          context: 'Document dates',
          severity: 'high'
        });
      }

      const daysDiff = Math.abs((billingDate.getTime() - serviceDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 365) {
        issues.push({
          description: `Billing date is ${Math.round(daysDiff)} days after service date - potential timing issue`,
          context: 'Document dates',
          severity: 'medium'
        });
      }
    }

    return issues;
  }
}