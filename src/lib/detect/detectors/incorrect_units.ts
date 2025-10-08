import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class IncorrectUnitsDetector {
  static readonly RULE_ID = 'INCORRECT_UNITS';

  // Expected unit ranges for common procedures
  private readonly unitLimits = new Map<string, {
    minUnits: number;
    maxUnits: number;
    description: string;
    unitType: 'time' | 'quantity' | 'area' | 'session';
  }>([
    // Time-based procedures (minutes)
    ['90834', { minUnits: 1, maxUnits: 1, description: 'Psychotherapy 45 minutes', unitType: 'time' }],
    ['90837', { minUnits: 1, maxUnits: 1, description: 'Psychotherapy 60 minutes', unitType: 'time' }],
    ['97110', { minUnits: 1, maxUnits: 8, description: 'Physical therapy exercise', unitType: 'time' }],
    ['97140', { minUnits: 1, maxUnits: 4, description: 'Manual therapy', unitType: 'time' }],

    // Anesthesia time units
    ['00100', { minUnits: 1, maxUnits: 50, description: 'Anesthesia base units + time', unitType: 'time' }],
    ['00300', { minUnits: 1, maxUnits: 30, description: 'Anesthesia integumentary', unitType: 'time' }],

    // Injection units
    ['96365', { minUnits: 1, maxUnits: 8, description: 'IV infusion initial hour', unitType: 'time' }],
    ['96366', { minUnits: 1, maxUnits: 23, description: 'IV infusion additional hour', unitType: 'time' }],
    ['96372', { minUnits: 1, maxUnits: 1, description: 'Therapeutic injection', unitType: 'quantity' }],

    // Surgical procedures (typically 1 unit)
    ['10060', { minUnits: 1, maxUnits: 1, description: 'Incision and drainage', unitType: 'quantity' }],
    ['11100', { minUnits: 1, maxUnits: 10, description: 'Skin biopsy', unitType: 'quantity' }],
    ['20610', { minUnits: 1, maxUnits: 1, description: 'Joint injection', unitType: 'quantity' }],

    // Radiology (typically 1 unit unless bilateral)
    ['73060', { minUnits: 1, maxUnits: 2, description: 'Knee X-ray', unitType: 'quantity' }],
    ['72148', { minUnits: 1, maxUnits: 1, description: 'MRI lumbar spine', unitType: 'quantity' }],
    ['74177', { minUnits: 1, maxUnits: 1, description: 'CT abdomen/pelvis', unitType: 'quantity' }],

    // Laboratory (quantity dependent)
    ['85025', { minUnits: 1, maxUnits: 1, description: 'Complete blood count', unitType: 'quantity' }],
    ['80053', { minUnits: 1, maxUnits: 1, description: 'Comprehensive metabolic panel', unitType: 'quantity' }],

    // Oxygen therapy
    ['99183', { minUnits: 1, maxUnits: 8, description: 'Hyperbaric oxygen per session', unitType: 'session' }],

    // Dialysis
    ['90935', { minUnits: 1, maxUnits: 1, description: 'Hemodialysis single session', unitType: 'session' }],
    ['90937', { minUnits: 1, maxUnits: 1, description: 'Hemodialysis single session', unitType: 'session' }],

    // Chemotherapy
    ['96413', { minUnits: 1, maxUnits: 8, description: 'Chemotherapy IV infusion', unitType: 'time' }],
    ['96415', { minUnits: 1, maxUnits: 12, description: 'Chemotherapy IV infusion additional', unitType: 'time' }]
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const unitViolations = this.findIncorrectUnits(context.lineItems);
    const triggered = unitViolations.length > 0;

    if (!triggered) {
      return {
        ruleId: IncorrectUnitsDetector.RULE_ID,
        triggered: false,
        confidence: 0.85,
        message: 'No incorrect units detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalOvercharge = unitViolations.reduce((sum, violation) =>
      sum + (violation.overchargeAmount || 0), 0
    );

    return {
      ruleId: IncorrectUnitsDetector.RULE_ID,
      triggered: true,
      confidence: 0.82,
      message: `Found ${unitViolations.length} incorrect unit billing issues`,
      affectedItems: unitViolations.map(violation => violation.code),
      recommendedAction: 'Verify units billed match actual service provided',
      potentialSavings: totalOvercharge,
      citations: [{
        title: 'Medicare Claims Processing Manual',
        authority: 'CMS',
        citation: 'Chapter 23 - Correct unit billing requirements'
      }],
      evidence: unitViolations.map(violation => ({
        field: 'units',
        value: `${violation.code}: ${violation.issue}`,
        location: `Service Date: ${violation.serviceDate}`
      }))
    };
  }

  private findIncorrectUnits(lineItems: any[]): Array<{
    code: string;
    serviceDate: string;
    issue: string;
    actualUnits: number;
    expectedRange: string;
    overchargeAmount?: MoneyCents;
  }> {
    const violations: Array<{
      code: string;
      serviceDate: string;
      issue: string;
      actualUnits: number;
      expectedRange: string;
      overchargeAmount?: MoneyCents;
    }> = [];

    lineItems.forEach(item => {
      const baseCode = this.getBaseCode(item.code);
      const unitLimit = this.unitLimits.get(baseCode);

      if (!unitLimit) return;

      const units = item.units || 1; // Default to 1 unit if not specified

      // Check if units are outside expected range
      if (units < unitLimit.minUnits || units > unitLimit.maxUnits) {
        const expectedRange = unitLimit.minUnits === unitLimit.maxUnits
          ? `${unitLimit.minUnits} unit`
          : `${unitLimit.minUnits}-${unitLimit.maxUnits} units`;

        let issue = `${units} units billed, expected ${expectedRange}`;
        let overchargeAmount: MoneyCents | undefined;

        if (units > unitLimit.maxUnits) {
          const excessUnits = units - unitLimit.maxUnits;
          const unitPrice = Math.floor(item.charge / units);
          overchargeAmount = excessUnits * unitPrice;
          issue += ` (${excessUnits} excess units)`;
        } else if (units < unitLimit.minUnits) {
          issue += ' (insufficient units for procedure)';
        }

        violations.push({
          code: item.code,
          serviceDate: item.serviceDate,
          issue,
          actualUnits: units,
          expectedRange,
          overchargeAmount
        });
      }

      // Additional unit validation based on procedure type
      const additionalIssues = this.validateUnitsByType(item, unitLimit);
      violations.push(...additionalIssues);
    });

    return violations;
  }

  private validateUnitsByType(item: any, unitLimit: {
    minUnits: number;
    maxUnits: number;
    description: string;
    unitType: 'time' | 'quantity' | 'area' | 'session';
  }): Array<{
    code: string;
    serviceDate: string;
    issue: string;
    actualUnits: number;
    expectedRange: string;
    overchargeAmount?: MoneyCents;
  }> {
    const issues: Array<{
      code: string;
      serviceDate: string;
      issue: string;
      actualUnits: number;
      expectedRange: string;
      overchargeAmount?: MoneyCents;
    }> = [];

    const units = item.units || 1;
    const baseCode = this.getBaseCode(item.code);

    switch (unitLimit.unitType) {
      case 'time':
        // Time-based units should be reasonable for procedure duration
        if (units > 8 && !this.isLongDurationProcedure(baseCode)) {
          issues.push({
            code: item.code,
            serviceDate: item.serviceDate,
            issue: `${units} time units unusual for ${unitLimit.description}`,
            actualUnits: units,
            expectedRange: '1-8 units typical',
            overchargeAmount: Math.floor((units - 8) * (item.charge / units))
          });
        }
        break;

      case 'quantity':
        // Most procedures should be 1 unit unless bilateral or multiple
        if (units > 2 && !this.canHaveMultipleUnits(baseCode)) {
          issues.push({
            code: item.code,
            serviceDate: item.serviceDate,
            issue: `${units} quantity units unusual for single ${unitLimit.description}`,
            actualUnits: units,
            expectedRange: '1-2 units typical',
            overchargeAmount: Math.floor((units - 2) * (item.charge / units))
          });
        }
        break;

      case 'session':
        // Sessions typically 1 unit per day
        if (units > 2) {
          issues.push({
            code: item.code,
            serviceDate: item.serviceDate,
            issue: `${units} sessions unusual for single day`,
            actualUnits: units,
            expectedRange: '1-2 sessions per day',
            overchargeAmount: Math.floor((units - 2) * (item.charge / units))
          });
        }
        break;
    }

    return issues;
  }

  private isLongDurationProcedure(code: string): boolean {
    // Procedures that can legitimately have many time units
    const longDurationCodes = [
      '00100', '00300', '00400', // Anesthesia codes
      '96413', '96415', // Chemotherapy
      '96365', '96366', // IV infusions
      '99183' // Hyperbaric oxygen
    ];

    return longDurationCodes.includes(code);
  }

  private canHaveMultipleUnits(code: string): boolean {
    // Procedures that can legitimately have multiple quantity units
    const multipleUnitCodes = [
      '11100', '11101', // Multiple biopsies
      '96372', '96373', // Multiple injections
      '20610', // Multiple joint injections
      '64483' // Multiple injection sites
    ];

    return multipleUnitCodes.includes(code);
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0]; // Remove modifiers
  }
}