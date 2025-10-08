import { DetectionResult, DetectionContext } from '../types';

export class LocationMismatchDetector {
  static readonly RULE_ID = 'LOCATION_MISMATCH';

  // Place of service codes and their restrictions
  private readonly placeOfServiceRules = new Map<string, {
    description: string;
    allowedProcedures?: string[];
    prohibitedProcedures?: string[];
    restrictions: string;
  }>([
    ['11', {
      description: 'Office',
      prohibitedProcedures: ['99221', '99222', '99223'], // Inpatient procedures
      restrictions: 'Outpatient procedures only'
    }],
    ['21', {
      description: 'Inpatient Hospital',
      prohibitedProcedures: ['99213', '99214', '99215'], // Office visits
      restrictions: 'Inpatient procedures only'
    }],
    ['22', {
      description: 'On Campus-Outpatient Hospital',
      prohibitedProcedures: ['99221', '99222', '99223'], // Inpatient procedures
      restrictions: 'Outpatient hospital procedures'
    }],
    ['23', {
      description: 'Emergency Room - Hospital',
      allowedProcedures: ['99281', '99282', '99283', '99284', '99285'],
      restrictions: 'Emergency department procedures only'
    }]
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const locationIssues = this.findLocationMismatches(context.lineItems);
    const triggered = locationIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: LocationMismatchDetector.RULE_ID,
        triggered: false,
        confidence: 0.80,
        message: 'No location/procedure mismatches detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    return {
      ruleId: LocationMismatchDetector.RULE_ID,
      triggered: true,
      confidence: 0.75,
      message: `Found ${locationIssues.length} location/procedure mismatches`,
      affectedItems: locationIssues.map(issue => issue.code),
      recommendedAction: 'Verify place of service matches procedure type',
      citations: [{
        title: 'Medicare Claims Processing Manual',
        authority: 'CMS',
        citation: 'Chapter 26 - Place of Service Code Guidelines'
      }],
      evidence: locationIssues.map(issue => ({
        field: 'placeOfService',
        value: `${issue.code}: ${issue.issue}`,
        location: `Service Date: ${issue.serviceDate}`
      }))
    };
  }

  private findLocationMismatches(lineItems: any[]): Array<{
    code: string;
    serviceDate: string;
    issue: string;
    placeOfService?: string;
  }> {
    const issues: Array<{
      code: string;
      serviceDate: string;
      issue: string;
      placeOfService?: string;
    }> = [];

    lineItems.forEach(item => {
      const pos = item.placeOfService;
      if (!pos) return;

      const baseCode = this.getBaseCode(item.code);
      const posRule = this.placeOfServiceRules.get(pos);

      if (posRule) {
        // Check prohibited procedures
        if (posRule.prohibitedProcedures?.includes(baseCode)) {
          issues.push({
            code: item.code,
            serviceDate: item.serviceDate,
            issue: `Procedure ${baseCode} not appropriate for ${posRule.description}`,
            placeOfService: pos
          });
        }

        // Check allowed procedures (if restricted list exists)
        if (posRule.allowedProcedures && !posRule.allowedProcedures.includes(baseCode)) {
          issues.push({
            code: item.code,
            serviceDate: item.serviceDate,
            issue: `Procedure ${baseCode} not in allowed list for ${posRule.description}`,
            placeOfService: pos
          });
        }
      }
    });

    return issues;
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0];
  }
}