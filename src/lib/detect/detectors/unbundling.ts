import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class UnbundlingDetector {
  static readonly RULE_ID = 'UNBUNDLING';

  // Common unbundling patterns in medical billing
  private readonly bundleRules = new Map<string, {
    comprehensive: string;
    components: string[];
    description: string;
  }>([
    // Surgical packages
    ['SURGICAL_GLOBAL', {
      comprehensive: '00000', // Placeholder for comprehensive codes
      components: ['99024', '99025'], // Follow-up codes that should be included
      description: 'Surgical global package includes post-operative care'
    }],
    // E&M with procedures
    ['EM_WITH_PROCEDURE', {
      comprehensive: '99213', // Office visit
      components: ['36415'], // Venipuncture
      description: 'Simple procedures included in E&M visit'
    }],
    // Lab panels vs individual tests
    ['BASIC_METABOLIC_PANEL', {
      comprehensive: '80048',
      components: ['82247', '82565', '84295', '82374', '84132', '82310', '84295', '82435'],
      description: 'Basic Metabolic Panel includes individual electrolyte tests'
    }],
    ['COMPREHENSIVE_METABOLIC_PANEL', {
      comprehensive: '80053',
      components: ['80048', '84460', '84450', '84520'], // BMP + liver function
      description: 'CMP includes Basic Metabolic Panel plus liver function tests'
    }],
    // Imaging bundles
    ['CT_WITH_CONTRAST', {
      comprehensive: '74177',
      components: ['74170', '74175'], // CT without + with contrast
      description: 'CT with and without contrast is comprehensive service'
    }]
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const unbundlingViolations = this.findUnbundlingViolations(context.lineItems);
    const triggered = unbundlingViolations.length > 0;

    if (!triggered) {
      return {
        ruleId: UnbundlingDetector.RULE_ID,
        triggered: false,
        confidence: 0.88,
        message: 'No unbundling violations detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalOvercharge = unbundlingViolations.reduce((sum, violation) =>
      sum + violation.excessAmount, 0
    );

    const affectedItems = unbundlingViolations.flatMap(violation =>
      violation.componentCodes
    );

    return {
      ruleId: UnbundlingDetector.RULE_ID,
      triggered: true,
      confidence: 0.85,
      message: `Found ${unbundlingViolations.length} potential unbundling violations`,
      affectedItems,
      recommendedAction: 'Request rebilling using appropriate bundled codes',
      potentialSavings: totalOvercharge,
      citations: [{
        title: 'National Correct Coding Initiative (NCCI)',
        authority: 'CMS',
        citation: 'NCCI Policy Manual - Correct Coding Initiative edits prevent unbundling'
      }],
      evidence: unbundlingViolations.map(violation => ({
        field: 'lineItems',
        value: `Components: ${violation.componentCodes.join(', ')} should use bundle: ${violation.bundleCode}`,
        location: `Service Date: ${violation.serviceDate}`
      }))
    };
  }

  private findUnbundlingViolations(lineItems: any[]): Array<{
    bundleCode: string;
    componentCodes: string[];
    serviceDate: string;
    excessAmount: MoneyCents;
    description: string;
  }> {
    const violations: Array<{
      bundleCode: string;
      componentCodes: string[];
      serviceDate: string;
      excessAmount: MoneyCents;
      description: string;
    }> = [];

    // Group line items by service date
    const itemsByDate = new Map<string, any[]>();
    lineItems.forEach(item => {
      const date = item.serviceDate || 'unknown';
      if (!itemsByDate.has(date)) {
        itemsByDate.set(date, []);
      }
      itemsByDate.get(date)!.push(item);
    });

    // Check each date for unbundling violations
    itemsByDate.forEach((items, serviceDate) => {
      const codes = new Set(items.map(item => item.code));

      this.bundleRules.forEach((rule, bundleName) => {
        // Check if comprehensive code is present
        const hasComprehensive = codes.has(rule.comprehensive);

        // Check if component codes are present
        const presentComponents = rule.components.filter(comp => codes.has(comp));

        if (hasComprehensive && presentComponents.length > 0) {
          // Found unbundling violation - comprehensive + components
          const componentItems = items.filter(item =>
            presentComponents.includes(item.code)
          );

          const excessAmount = componentItems.reduce((sum, item) =>
            sum + item.charge, 0
          );

          violations.push({
            bundleCode: rule.comprehensive,
            componentCodes: presentComponents,
            serviceDate,
            excessAmount,
            description: rule.description
          });
        } else if (!hasComprehensive && presentComponents.length >= 2) {
          // Check if multiple components present without comprehensive
          // This might indicate the comprehensive code should have been used instead
          const componentItems = items.filter(item =>
            presentComponents.includes(item.code)
          );

          // Estimate if bundle would be cheaper
          const componentTotal = componentItems.reduce((sum, item) =>
            sum + item.charge, 0
          );

          // Rough estimate: bundles typically 20-40% less than sum of parts
          const estimatedBundlePrice = Math.floor(componentTotal * 0.75);
          const potentialSavings = componentTotal - estimatedBundlePrice;

          if (potentialSavings > 0) {
            violations.push({
              bundleCode: rule.comprehensive,
              componentCodes: presentComponents,
              serviceDate,
              excessAmount: potentialSavings,
              description: `${rule.description} - consider bundled code instead`
            });
          }
        }
      });

      // Check for common NCCI edits (simplified subset)
      this.checkNCCIViolations(items, serviceDate, violations);
    });

    return violations;
  }

  private checkNCCIViolations(
    items: any[],
    serviceDate: string,
    violations: Array<{
      bundleCode: string;
      componentCodes: string[];
      serviceDate: string;
      excessAmount: MoneyCents;
      description: string;
    }>
  ): void {
    const codes = items.map(item => item.code);

    // Common NCCI violation patterns
    const ncciPatterns = [
      {
        primary: '99213', // Office visit
        mutuallyExclusive: ['36415'], // Venipuncture
        description: 'Venipuncture included in E&M visit when performed for diagnostic purposes'
      },
      {
        primary: '45378', // Colonoscopy
        mutuallyExclusive: ['45330'], // Flexible sigmoidoscopy
        description: 'Sigmoidoscopy included in full colonoscopy'
      },
      {
        primary: '93000', // EKG with interpretation
        mutuallyExclusive: ['93005', '93010'], // EKG components
        description: 'EKG components should not be billed separately when comprehensive service performed'
      }
    ];

    ncciPatterns.forEach(pattern => {
      const hasPrimary = codes.includes(pattern.primary);
      const hasExclusive = pattern.mutuallyExclusive.some(code => codes.includes(code));

      if (hasPrimary && hasExclusive) {
        const exclusiveItems = items.filter(item =>
          pattern.mutuallyExclusive.includes(item.code)
        );

        const excessAmount = exclusiveItems.reduce((sum, item) =>
          sum + item.charge, 0
        );

        violations.push({
          bundleCode: pattern.primary,
          componentCodes: pattern.mutuallyExclusive.filter(code => codes.includes(code)),
          serviceDate,
          excessAmount,
          description: pattern.description
        });
      }
    });
  }
}